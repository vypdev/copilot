import type { BugbotFindingResolutionPorts } from '../../../../../application/ports/bugbot_finding_resolution_ports';
import { PullRequestReviewOperationError } from '../../../../../application/ports/pull_request_review_errors';
import type { Execution } from '../../../../../data/model/execution';
import { logError } from '../../../../ports/logging_ports';
import type { BugbotContext, BugbotFindingResolution, ExistingPullRequestFindingInfo } from './types';
import { resolveIssueFinding } from './resolve_issue_finding';
import { resolvePullRequestFinding } from './resolve_pull_request_finding';

export interface MarkFindingsResolvedParam {
    execution: Execution;
    context: BugbotContext;
    resolvedFindingIds: Set<string>;
    resolvedFindingResolutions?: ReadonlyMap<string, BugbotFindingResolution>;
    ports: BugbotFindingResolutionPorts;
}

export async function markFindingsResolved(param: MarkFindingsResolvedParam): Promise<Error[]> {
    const errors: Error[] = [];
    for (const [findingId, existing] of Object.entries(param.context.existingByFindingId)) {
        await repairExistingPullRequestFinding(param.ports, param.execution, findingId, existing.pullRequest, errors);
        if (!param.resolvedFindingIds.has(findingId)) continue;
        await resolvePullRequestIfNeeded(param, findingId, existing.pullRequest, errors);
        await resolveIssueIfNeeded(param, findingId, existing.issue, errors);
    }
    return errors;
}

async function repairExistingPullRequestFinding(
    ports: BugbotFindingResolutionPorts,
    execution: Execution,
    findingId: string,
    destination: ExistingPullRequestFindingInfo | undefined,
    errors: Error[],
): Promise<void> {
    if (destination?.resolved) await tryResolvePullRequestFinding(ports, execution, findingId, destination, errors);
}

async function resolvePullRequestIfNeeded(
    param: MarkFindingsResolvedParam,
    findingId: string,
    destination: ExistingPullRequestFindingInfo | undefined,
    errors: Error[],
): Promise<void> {
    if (destination != null && !destination.resolved) {
        await tryResolvePullRequestFinding(
            param.ports,
            param.execution,
            findingId,
            destination,
            errors,
            param.resolvedFindingResolutions?.get(findingId),
        );
    }
}

async function resolveIssueIfNeeded(
    param: MarkFindingsResolvedParam,
    findingId: string,
    destination: { commentId: number; resolved: boolean } | undefined,
    errors: Error[],
): Promise<void> {
    if (destination == null || destination.resolved) return;
    const comment = param.context.issueComments.find(item => item.id === destination.commentId);
    if (comment?.body == null) {
        addResolutionError(errors, 'issue');
        return;
    }
    try {
        await resolveIssueFinding(param.ports.issueComments, {
            findingId,
            comment: { id: comment.id, body: comment.body },
            owner: param.execution.owner,
            repo: param.execution.repo,
            issueNumber: param.execution.issueNumber,
            token: param.execution.tokens.token,
            resolution: param.resolvedFindingResolutions?.get(findingId),
        });
    } catch {
        addResolutionError(errors, 'issue');
    }
}

async function tryResolvePullRequestFinding(
    ports: BugbotFindingResolutionPorts,
    execution: Execution,
    findingId: string,
    destination: ExistingPullRequestFindingInfo,
    errors: Error[],
    resolution?: BugbotFindingResolution,
): Promise<void> {
    try {
        await resolvePullRequestFinding(ports.pullRequestComments, {
            findingId,
            commentIdentity: destination.commentIdentity,
            pullRequestNumber: destination.pullRequestNumber,
            owner: execution.owner,
            repo: execution.repo,
            token: execution.tokens.token,
            resolution,
        });
    } catch {
        addResolutionError(errors, 'pull request');
    }
}

function addResolutionError(errors: Error[], destination: 'issue' | 'pull request'): void {
    const error = destination === 'pull request'
        ? new PullRequestReviewOperationError('mark-resolved')
        : new Error('Unable to mark an issue finding as resolved.');
    logError(error);
    errors.push(error);
}
