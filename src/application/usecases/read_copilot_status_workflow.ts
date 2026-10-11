import type { CommentAutomationContext } from './comment_automation_context';
import type { BoundBugbotContextReadPorts } from '../ports/bugbot_context_ports';
import type { PullRequestStatusQueryPorts } from '../ports/pull_request_status_read_ports';
import type { ApprovalObservationTarget } from '../ports/pull_request_approval_ports';
import type { ApprovalEvidence } from '../../domain/pull_request_approval';
import type { CopilotStatusSnapshot } from '../policies/status_command_policy';
import { buildCopilotStatusResult } from '../policies/status_command_policy';
import { BUGBOT_STATUS_COUNTS_PREFIX, readBugbotStatusCounts } from '../policies/bugbot_status_count_marker_policy';
import { isTrustedBugbotAuthor } from '../policies/bugbot_review_ownership_policy';
import { isBugbotStatusComment } from '../policies/bugbot_review_presentation_policy';
import { selectCanonicalBugbotPullRequest } from '../../domain/bugbot/context';
import { projectBugbotContextRequest } from './steps/commit/bugbot/bugbot_context_request';
import { parsePullRequestApprovalPolicy } from '../../domain/pull_request_approval_policy';
import { projectPullRequestReadiness, unavailablePullRequestReadiness,
    type PullRequestReadinessSnapshot } from '../policies/pull_request_readiness_policy';

export type CopilotStatusReadPorts = Pick<BoundBugbotContextReadPorts,
    'getPullRequest' | 'listIssueComments' | 'getPullRequestHeadSha'> & Partial<PullRequestStatusQueryPorts>;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

/** Independent reads retain verified facts. Unknown identity or freshness never becomes a clean snapshot. */
export async function readCopilotStatus(param: CommentAutomationContext, taskId: string, ports?: CopilotStatusReadPorts) {
    const original = param.status;
    if (original.target !== 'issue' && original.target !== 'pull-request') return buildCopilotStatusResult(original, taskId);
    let snapshot: CopilotStatusSnapshot = { ...original, findingStates: undefined, findingStateEvidence: 'invalid', serverOrigin: ports?.serverOrigin };
    const finish = (readiness: PullRequestReadinessSnapshot) => buildCopilotStatusResult({ ...snapshot, pullRequestReadiness: readiness }, taskId);
    const fail = (code: string, action: 'retry' | 'select-pr' = 'retry') => finish(unavailablePullRequestReadiness(code, action));
    if (!ports) return fail('evidence-adapter-unavailable');
    const request = projectBugbotContextRequest(param.bugbot.review);
    const repositoryId = request.target.repository.id;
    if (!positive(repositoryId) || request.target.repository.owner.toLowerCase() !== original.owner.toLowerCase()
        || request.target.repository.name.toLowerCase() !== original.repository.toLowerCase()) return fail('identity-unavailable');
    let number: number;
    let fromIssue = false;
    if (original.target === 'issue') {
        if (!positive(original.issueNumber) || !ports.readLinkedPullRequests) return fail('linkage-unavailable');
        let links;
        try { links = await ports.readLinkedPullRequests(original.issueNumber); } catch { return fail('linkage-unavailable'); }
        if (links.state !== 'available' || links.repositoryId !== repositoryId || links.issueNumber !== original.issueNumber
            || !Array.isArray(links.numbers) || links.numbers.some(value => !positive(value))
            || new Set(links.numbers).size !== links.numbers.length) return fail('linkage-unavailable');
        if (links.numbers.length === 0) {
            snapshot = { ...snapshot, findingStates: undefined, findingStateEvidence: undefined };
            return finish({ readiness: 'not-applicable', mode: 'unavailable', headSha: '', baseSha: '',
                code: 'unlinked-issue', humanReviewRequired: false, action: 'none' });
        }
        if (links.numbers.length !== 1) return fail('ambiguous-linkage', 'select-pr');
        number = links.numbers[0]; fromIssue = true;
    } else {
        const selection = request.target.pullRequestSelection;
        if (!positive(original.pullRequestNumber) || selection.kind !== 'event' || selection.number !== original.pullRequestNumber) return fail('identity-unavailable');
        number = original.pullRequestNumber;
    }
    let pull;
    try {
        const target = fromIssue ? { ...request.target, headRef: '', expectedHeadSha: undefined,
            pullRequestSelection: { kind: 'event' as const, number } } : request.target;
        const selected = selectCanonicalBugbotPullRequest(target, [await ports.getPullRequest(number)], 'event');
        if (selected.kind !== 'canonical') return fail('identity-unavailable');
        pull = selected.pullRequest;
    } catch { return fail('identity-unavailable'); }
    const target: ApprovalObservationTarget = { owner: original.owner, repository: original.repository, repositoryId, pullNumber: number };
    let rawPolicy: string | undefined;
    let evidence: ApprovalEvidence | undefined;
    let readiness = unavailablePullRequestReadiness('evidence-adapter-unavailable');
    if (ports.approval) {
        try {
            rawPolicy = await ports.approval.readPolicy(target);
            try { parsePullRequestApprovalPolicy(rawPolicy); }
            catch { readiness = Object.freeze({ ...unavailablePullRequestReadiness('invalid-policy', 'resolve'), readiness: 'blocked' }); }
            if (readiness.code !== 'invalid-policy') {
                const read = await ports.approval.loadEvidence(target);
                if (read.repositoryId !== repositoryId || read.pullNumber !== number || !sha(read.headSha) || !sha(read.baseSha)) {
                    readiness = unavailablePullRequestReadiness('target-mismatch');
                } else evidence = read;
            }
        } catch { readiness = unavailablePullRequestReadiness(); }
    }
    // A missing, denied or incomplete Bugbot card cannot erase independent approval evidence.
    let counts;
    try {
        const comments = await ports.listIssueComments(number);
        if (comments.coverage.status === 'complete') {
            const candidates = comments.value.filter(comment => isTrustedBugbotAuthor(comment.user?.login, param.trustedBotLogin)
                && isBugbotStatusComment(comment.body) && comment.body?.includes(BUGBOT_STATUS_COUNTS_PREFIX));
            if (candidates.length === 1) counts = readBugbotStatusCounts(candidates[0].body ?? '', number, pull.headSha);
        }
    } catch { /* Retain all independently verified facts. */ }
    let observedRevisionHead: string | undefined;
    if (evidence && ports.approval) {
        try {
            const revision = await ports.approval.readRevision(target);
            const finalPolicy = await ports.approval.readPolicy(target);
            if (revision.repositoryId !== repositoryId || revision.pullNumber !== number) return fail('target-mismatch');
            observedRevisionHead = revision.headSha;
            readiness = projectPullRequestReadiness(rawPolicy, evidence, { ...revision, rawPolicy: finalPolicy });
            if (pull.headSha !== evidence.headSha) readiness = Object.freeze({ ...readiness, readiness: 'pending', code: 'superseded',
                action: 'wait', evidence: Object.freeze({ ci: 'pending', coverage: 'pending', bugbot: 'pending', reviews: 'pending' }) });
        } catch { readiness = unavailablePullRequestReadiness('final-evidence-unavailable'); }
    }
    let finalHead: string | undefined;
    try { finalHead = await ports.getPullRequestHeadSha(number); }
    catch { /* A denied freshness read cannot certify counts. */ }
    if (finalHead === pull.headSha && (!observedRevisionHead || observedRevisionHead === finalHead) && counts) snapshot = { ...snapshot, findingStateEvidence: undefined,
        findingStates: { open: counts.open, reopened: counts.reopened, verificationRequired: counts['verification-required'], unknown: counts.unknown,
            resolved: counts.fixed + counts.obsolete + counts.dismissed } };
    if (finalHead !== pull.headSha && readiness.readiness !== 'pending') readiness = unavailablePullRequestReadiness('final-identity-unavailable');
    if (fromIssue) {
        try {
            const final = await ports.readLinkedPullRequests!(original.issueNumber!);
            if (final.state !== 'available' || final.repositoryId !== repositoryId || final.issueNumber !== original.issueNumber
                || final.numbers.length !== 1 || final.numbers[0] !== number) {
                snapshot = { ...snapshot, findingStates: undefined, findingStateEvidence: 'invalid' }; return fail('linkage-superseded');
            }
        } catch { snapshot = { ...snapshot, findingStates: undefined, findingStateEvidence: 'invalid' }; return fail('linkage-unavailable'); }
    }
    return finish(Object.freeze({ ...readiness, pullNumber: number }));
}
