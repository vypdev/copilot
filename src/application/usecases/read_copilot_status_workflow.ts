import type { CommentAutomationContext } from './comment_automation_context';
import type { BoundBugbotContextReadPorts } from '../ports/bugbot_context_ports';
import { buildCopilotStatusResult } from '../policies/status_command_policy';
import { BUGBOT_STATUS_COUNTS_PREFIX, readBugbotStatusCounts } from '../policies/bugbot_status_count_marker_policy';
import { isTrustedBugbotAuthor } from '../policies/bugbot_review_ownership_policy';
import { isBugbotStatusComment } from '../policies/bugbot_review_presentation_policy';
import { selectCanonicalBugbotPullRequest } from '../../domain/bugbot/context';
import { projectBugbotContextRequest } from './steps/commit/bugbot/bugbot_context_request';
import { ApplicationError } from '../errors/application_error';
import type { ApprovalObservationTarget } from '../ports/pull_request_approval_ports';
import { projectPullRequestReadiness } from '../policies/pull_request_readiness_policy';

export type CopilotStatusReadPorts = Pick<BoundBugbotContextReadPorts,
    'getPullRequest' | 'listIssueComments' | 'getPullRequestHeadSha'> & {
        /** A deliberately narrow projection. Status cannot publish assessments or reviews. */
        readonly approval?: Pick<import('../ports/pull_request_approval_ports').PullRequestApprovalPort,
            'readPolicy' | 'loadEvidence'>;
    };

/** Reads the current canonical card, without an agent, diff, rules or workspace mutation. */
export async function readCopilotStatus(param: CommentAutomationContext, taskId: string, ports?: CopilotStatusReadPorts) {
    if (!param.status.pullRequestNumber) return buildCopilotStatusResult(param.status, taskId);
    if (!ports) return buildCopilotStatusResult({ ...param.status,
        pullRequestReadiness: { readiness: 'unavailable', mode: 'unavailable', headSha: '', baseSha: '',
            code: 'evidence-adapter-unavailable', humanReviewRequired: true },
    }, taskId);
    const request = projectBugbotContextRequest(param.bugbot.review);
    const selection = request.target.pullRequestSelection;
    if (selection.kind !== 'event' || selection.number !== param.status.pullRequestNumber) throw unavailableStatus();
    const canonical = selectCanonicalBugbotPullRequest(request.target, [await ports.getPullRequest(selection.number)], 'event');
    if (canonical.kind !== 'canonical') throw unavailableStatus();
    const pull = canonical.pullRequest;
    let snapshot = param.status;
    if (ports.approval) {
        try {
            const target: ApprovalObservationTarget = {
                owner: request.target.repository.owner, repository: request.target.repository.name,
                repositoryId: request.target.repository.id!, pullNumber: pull.number,
            };
            const rawPolicy = await ports.approval.readPolicy(target);
            const evidence = await ports.approval.loadEvidence(target);
            const finalEvidence = await ports.approval.loadEvidence(target);
            const finalPolicy = await ports.approval.readPolicy(target);
            const readiness = projectPullRequestReadiness(rawPolicy, evidence, {
                repositoryId: finalEvidence.repositoryId, pullNumber: finalEvidence.pullNumber,
                headSha: finalEvidence.headSha, baseSha: finalEvidence.baseSha, rawPolicy: finalPolicy,
            });
            snapshot = { ...snapshot, pullRequestReadiness: readiness };
        } catch {
            snapshot = { ...snapshot, pullRequestReadiness: { readiness: 'unavailable' as const,
                mode: 'unavailable' as const, headSha: pull.headSha, baseSha: '',
                code: 'evidence-unavailable', humanReviewRequired: true } };
        }
    } else {
        // A missing binding is an explicit failure of evidence collection, never an implicit opt-out.
        snapshot = { ...snapshot, pullRequestReadiness: { readiness: 'unavailable',
            mode: 'unavailable', headSha: pull.headSha, baseSha: '',
            code: 'evidence-adapter-unavailable', humanReviewRequired: true } };
    }
    const comments = await ports.listIssueComments(pull.number);
    if (comments.coverage.status !== 'complete') throw unavailableStatus();
    const candidates = comments.value.filter(comment => isTrustedBugbotAuthor(comment.user?.login, param.trustedBotLogin)
        && isBugbotStatusComment(comment.body) && comment.body?.includes(BUGBOT_STATUS_COUNTS_PREFIX));
    if (candidates.length !== 1) throw unavailableStatus();
    const counts = readBugbotStatusCounts(candidates[0].body ?? '', pull.number, pull.headSha);
    if (!counts || await ports.getPullRequestHeadSha(pull.number) !== pull.headSha) throw unavailableStatus();
    return buildCopilotStatusResult({ ...snapshot,
        findingStateEvidence: undefined,
        findingStates: { open: counts.open, reopened: counts.reopened,
            verificationRequired: counts['verification-required'], unknown: counts.unknown,
            resolved: counts.fixed + counts.obsolete + counts.dismissed },
    }, taskId);
}

function unavailableStatus(): ApplicationError {
    return new ApplicationError('workflow.stale', 'Current Bugbot status evidence is unavailable, incomplete or stale. Run /copilot recheck and retry status.');
}
