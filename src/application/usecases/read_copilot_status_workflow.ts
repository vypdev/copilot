import type { NativeIssueCompletionFacts } from '../../domain/issue_completion';
import type { NativePullRequestCompletionFacts } from '../ports/issue_completion_ports';
import type { SddEvidenceQueryPort } from '../ports/sdd_evidence_read_ports';
import { projectSddStatus } from '../policies/sdd_status_policy';
import type { CommentAutomationContext } from './comment_automation_context';
import type { BoundBugbotContextReadPorts } from '../ports/bugbot_context_ports';
import type { BoundNativeStatusReadPort } from '../ports/issue_completion_ports';
import { buildCopilotStatusResult, projectCurrentNativeStatus } from '../policies/status_command_policy';
import { BUGBOT_STATUS_COUNTS_PREFIX, readBugbotStatusCounts } from '../policies/bugbot_status_count_marker_policy';
import { isTrustedBugbotAuthor } from '../policies/bugbot_review_ownership_policy';
import { isBugbotStatusComment } from '../policies/bugbot_review_presentation_policy';
import { selectCanonicalBugbotPullRequest } from '../../domain/bugbot/context';
import { projectBugbotContextRequest } from './steps/commit/bugbot/bugbot_context_request';
import { ApplicationError } from '../errors/application_error';

export type CopilotStatusReadPorts = Pick<BoundBugbotContextReadPorts,
    'getPullRequest' | 'listIssueComments' | 'getPullRequestHeadSha'>;

/** Reads the current canonical card, without an agent, diff, rules or workspace mutation. */
export async function readCopilotStatus(param: CommentAutomationContext, taskId: string, ports?: CopilotStatusReadPorts, sddQuery?: SddEvidenceQueryPort, nativeStatus?: BoundNativeStatusReadPort) {
    let initialIssue: NativeIssueCompletionFacts | undefined;
    let initialPull: NativePullRequestCompletionFacts | undefined;
    let status = sddQuery ? Object.freeze({ ...param.status, serverOrigin: sddQuery.serverOrigin }) : param.status;
    if (nativeStatus && status.target === 'issue' && status.issueNumber) {
        const facts = await nativeStatus.readIssue(status.issueNumber);
        if (facts.number !== status.issueNumber) throw unavailableStatus();
        initialIssue = facts;
        status = projectCurrentNativeStatus(status, facts);
    } else if (nativeStatus && status.target === 'pull-request' && status.pullRequestNumber) {
        const facts = await nativeStatus.readPullRequest(status.pullRequestNumber);
        if (facts.number !== status.pullRequestNumber) throw unavailableStatus();
        initialPull = facts;
        status = projectCurrentNativeStatus(status, facts);
        if (facts.state === 'closed') {
            await fenceNativePull(nativeStatus, facts);
            return buildCopilotStatusResult({ ...status, findingStates: undefined, findingStateEvidence: undefined }, taskId);
        }
    }
    if (status.target === 'issue' && param.sdd && status.issueNumber === param.sdd.issueNumber && sddQuery && status.sddReadiness) {
        const evidence = await sddQuery.read(param.sdd);
        status = Object.freeze({ ...status, sddReadiness: projectSddStatus(evidence, status.sddReadiness) });
    }
    if (nativeStatus && initialIssue) {
        const final = await nativeStatus.readIssue(initialIssue.number);
        if (final.number !== initialIssue.number || final.state !== initialIssue.state || final.reason !== initialIssue.reason
            || JSON.stringify([...final.labels].sort()) !== JSON.stringify([...initialIssue.labels].sort())) throw unavailableStatus();
        status = projectCurrentNativeStatus(status, final);
    }
    if (!status.pullRequestNumber || !ports) return buildCopilotStatusResult(status, taskId);
    const request = projectBugbotContextRequest(param.bugbot.review);
    const selection = request.target.pullRequestSelection;
    if (selection.kind !== 'event' || selection.number !== status.pullRequestNumber) throw unavailableStatus();
    const canonical = selectCanonicalBugbotPullRequest(request.target, [await ports.getPullRequest(selection.number)], 'event');
    if (canonical.kind !== 'canonical') throw unavailableStatus();
    const pull = canonical.pullRequest;
    const comments = await ports.listIssueComments(pull.number);
    if (comments.coverage.status !== 'complete') throw unavailableStatus();
    const candidates = comments.value.filter(comment => isTrustedBugbotAuthor(comment.user?.login, param.trustedBotLogin)
        && isBugbotStatusComment(comment.body) && comment.body?.includes(BUGBOT_STATUS_COUNTS_PREFIX));
    if (candidates.length !== 1) throw unavailableStatus();
    const counts = readBugbotStatusCounts(candidates[0].body ?? '', pull.number, pull.headSha);
    if (!counts || await ports.getPullRequestHeadSha(pull.number) !== pull.headSha) throw unavailableStatus();
    if (nativeStatus && initialPull) await fenceNativePull(nativeStatus, initialPull);
    return buildCopilotStatusResult({ ...status,
        findingStateEvidence: undefined,
        findingStates: { open: counts.open, reopened: counts.reopened,
            verificationRequired: counts['verification-required'], unknown: counts.unknown,
            resolved: counts.fixed + counts.obsolete + counts.dismissed },
    }, taskId);
}

function unavailableStatus(): ApplicationError {
    return new ApplicationError('workflow.stale', 'Current Bugbot status evidence is unavailable, incomplete or stale. Run /copilot recheck and retry status.');
}

async function fenceNativePull(port: BoundNativeStatusReadPort, original: NativePullRequestCompletionFacts): Promise<void> {
    const fresh = await port.readPullRequest(original.number);
    if (fresh.number !== original.number || fresh.state !== original.state || fresh.merged !== original.merged) throw unavailableStatus();
}
