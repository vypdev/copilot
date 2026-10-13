import { Result } from '../../data/model/result';
import { aggregateGithubRuntimeDoctorReport, parseTrustedDoctorApprovalPolicy,
    type GithubRuntimeDoctorCheck, type GithubRuntimeDoctorReport, type GithubRuntimeDoctorGroup } from '../../domain/github_runtime_doctor';
import { classifyIssueWorkflow } from '../../domain/issue_workflow_profile';
import { decideIssueStart } from '../../domain/issue_start_policy';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';
import { selectCanonicalBugbotPullRequest } from '../../domain/bugbot/context';
import type { GithubRuntimeDoctorPorts, DoctorRepositoryRead } from '../ports/github_runtime_doctor_ports';
import { doctorRepositoryPrerequisites, doctorWorkflowContracts, validDoctorConfiguration } from '../policies/github_runtime_doctor_policy';
import { formatGithubRuntimeDoctor } from '../policies/github_runtime_doctor_presentation_policy';
import { projectBugbotContextRequest } from './steps/commit/bugbot/bugbot_context_request';
import type { CommentAutomationContext } from './comment_automation_context';

export async function readCopilotDoctor(param: CommentAutomationContext, taskId: string, ports?: GithubRuntimeDoctorPorts): Promise<Result> {
    const repositoryId = parsePositiveSafeInteger(param.bugbot.review.repository.id);
    const isPull = param.status.target === 'pull-request';
    const number = parsePositiveSafeInteger(isPull ? param.status.pullRequestNumber : param.status.issueNumber);
    if (!repositoryId || !number) return doctorResult(taskId, undefined);
    const target = isPull ? { kind: 'pull-request' as const, repositoryId, pullNumber: number }
        : { kind: 'issue' as const, repositoryId, issueNumber: number };
    const checks: GithubRuntimeDoctorCheck[] = [];
    const put = (group: GithubRuntimeDoctorGroup, state: GithubRuntimeDoctorCheck['state'], action?: string) =>
        checks.push(Object.freeze({ group, state, evidence: { source: group }, ...(action && state !== 'pass' && state !== 'not-applicable' ? { action: state === 'unavailable' ? 'retry' : action } : {}) }));
    const configuration = param.doctorConfiguration;
    const valid = validDoctorConfiguration(configuration);
    put('effective-configuration', configuration === undefined ? 'unavailable' : valid ? 'pass' : 'blocked',
        !valid ? 'configuration' : undefined);
    const repositoryRead: DoctorRepositoryRead = ports ? await ports.readRepository(repositoryId).catch(() => ({ state: 'unavailable' as const }))
        : { state: 'unavailable' };
    const verifiedRead: DoctorRepositoryRead = repositoryRead.state === 'available'
        && (repositoryRead.repositoryId !== repositoryId || !/^[a-f0-9]{40}$/u.test(repositoryRead.revision))
        ? { state: 'unavailable' } : repositoryRead;
    put('workflow-contracts', doctorWorkflowContracts(verifiedRead), 'workflow');
    if (isPull) {
        // Optional issue context is not guessed from a PR number or event prose.
        put('issue-readiness', 'not-applicable'); put('linked-branch-readiness', 'not-applicable');
    } else if (!valid || !ports) {
        put('issue-readiness', 'unavailable', 'retry'); put('linked-branch-readiness', 'unavailable', 'retry');
    } else {
        try {
            const issue = await ports.readIssue(number);
            if (issue.number !== number) throw new Error('Wrong issue identity.');
            const kindAdmission = classifyIssueWorkflow(issue.labels, configuration.profile, configuration.labels, undefined, false);
            // Form completeness cannot make branchless help work require an SDD.
            // Disabled or conflicting kinds still retain their admission block.
            const admission = kindAdmission.status === 'eligible' && kindAdmission.kind === 'help' ? kindAdmission
                : classifyIssueWorkflow(issue.labels, configuration.profile, configuration.labels, issue.body);
            if (admission.status !== 'eligible') {
                put('issue-readiness', admission.status === 'unmanaged' ? 'unavailable' : 'blocked', 'issue');
                put('linked-branch-readiness', 'not-applicable');
            } else {
                const decision = decideIssueStart({ kind: admission.kind, labels: issue.labels,
                    issueManagedBranches: configuration.issueManagedBranches, preBranchSdd: configuration.preBranchSdd });
                put('issue-readiness', decision.sddRequired ? doctorRepositoryPrerequisites(verifiedRead) : 'not-applicable', 'specifications');
                if (!decision.branchRequired) put('linked-branch-readiness', 'not-applicable');
                else {
                    const branch = await ports.readLinkedBranch(number).catch(() => ({ state: 'unavailable' as const }));
                    const state = branch.state === 'available' && branch.repositoryId === repositoryId && /^[a-f0-9]{40}$/u.test(branch.headSha)
                        ? 'pass' : branch.state === 'absent' ? 'warning' : 'unavailable';
                    put('linked-branch-readiness', state, 'branch');
                }
            }
        } catch { put('issue-readiness', 'unavailable', 'retry'); put('linked-branch-readiness', 'unavailable', 'retry'); }
    }
    const policyRead = ports ? await ports.readApprovalPolicy().catch(() => ({ status: 'unavailable' as const }))
        : { status: 'unavailable' as const };
    const policy = parseTrustedDoctorApprovalPolicy(policyRead);
    put('approval-policy', policy.status === 'valid' ? 'pass' : policy.status === 'invalid' ? 'blocked' : 'unavailable', 'policy');
    if (policy.status === 'valid' || policyRead.status === 'available') checks[checks.length - 1] = Object.freeze({ ...checks[checks.length - 1],
        evidence: { source: policyRead.status === 'available' ? policyRead.source : policy.status === 'valid' ? policy.source : 'unavailable' } });
    put('approval-prerequisites', policy.status !== 'valid' ? 'unavailable' : policy.policy.mode === 'off' ? 'not-applicable' : 'warning', 'declared');
    if (policy.status === 'valid') checks[checks.length - 1] = Object.freeze({ ...checks[checks.length - 1], evidence: { source: policy.policy.mode } });
    if (!isPull) put('pull-request-identity', 'not-applicable');
    else {
        let state: GithubRuntimeDoctorCheck['state'] = 'unavailable';
        try {
            if (ports) {
                const request = projectBugbotContextRequest(param.bugbot.review);
                const selection = request.target.pullRequestSelection;
                if (selection.kind === 'event' && selection.number === number) {
                    const canonical = selectCanonicalBugbotPullRequest(request.target, [await ports.pullRequests.getPullRequest(number)], 'event');
                    if (canonical.kind === 'canonical' && /^[a-f0-9]{40}$/u.test(canonical.pullRequest.headSha)
                        && await ports.pullRequests.getPullRequestHeadSha(number) === canonical.pullRequest.headSha) state = 'pass';
                }
            }
        } catch { /* Independent facts remain available. */ }
        put('pull-request-identity', state, 'retry');
    }
    const report = aggregateGithubRuntimeDoctorReport({ target, checks });
    return doctorResult(taskId, report, ports?.serverOrigin, verifiedRead.state === 'available' ? verifiedRead.revision : undefined,
        param.status.owner, param.status.repository);
}
function doctorResult(taskId: string, report?: GithubRuntimeDoctorReport, serverOrigin?: string, revision?: string, owner?: string, repository?: string): Result {
    const projection = Object.freeze({ report, serverOrigin, revision, owner, repository });
    return new Result({ id: `${taskId}.Doctor`, success: true, executed: true, stepFormat: 'markdown',
        steps: [formatGithubRuntimeDoctor(projection)], payload: { doctor: projection } });
}
