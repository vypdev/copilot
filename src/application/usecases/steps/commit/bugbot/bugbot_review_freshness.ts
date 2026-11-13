import { ApplicationError } from '../../../../errors/application_error';
import { canonicalGitObjectId } from '../../../../../domain/git_object_id';
import { PullRequestReviewOperationError } from '../../../../ports/pull_request_review_errors';
import { bugbotFreshnessError, type BugbotFreshnessBoundary } from '../../../../errors/bugbot_freshness_error';
import { BugbotReviewCompletenessError } from '../../../../../domain/bugbot/framed_review';
import { sameBugbotFramedPullRequest } from '../../../../policies/bugbot_framed_identity_policy';
import type { BugbotContextPorts } from '../../../../ports/bugbot_context_ports';
import type { BugbotContext } from './types';

export function isLoadedBugbotRevisionSuperseded(context: BugbotContext, expectedHeadSha: string | undefined): boolean {
    return expectedHeadSha !== undefined && context.prContext !== null
        && context.prContext.prHeadSha.toLowerCase() !== expectedHeadSha;
}

/** Re-reads the remote head immediately before publication to close the analysis race window. */
export async function hasNewerBugbotRevision(
    context: BugbotContext,
    ports: BugbotContextPorts,
    boundary: BugbotFreshnessBoundary = 'before-publication',
    compareBase = false,
): Promise<boolean> {
    if (!context.prContext || !context.canonicalPullRequest) return false;
    const operation = context.reviewFramedSource || compareBase ? 'get-source-bound-pr' : 'get-head-sha';
    try {
        if (context.reviewFramedSource) {
            if (!ports.getSourceBoundPullRequest) throw new BugbotReviewCompletenessError('capability');
            const current = await ports.getSourceBoundPullRequest(context.canonicalPullRequest.number);
            return !sameBugbotFramedPullRequest(context.canonicalPullRequest, current);
        }
        if (compareBase) {
            const expected = context.canonicalPullRequest;
            const current = await ports.getPullRequest(expected.number);
            const expectedBase = canonicalGitObjectId(expected.baseSha);
            if (!current || !expectedBase || !canonicalGitObjectId(current.baseSha) || !canonicalGitObjectId(current.headSha)) {
                throw bugbotFreshnessError(undefined, boundary, operation, true);
            }
            return current.number !== expected.number || current.state !== 'open' || current.draft !== expected.draft
                || current.baseRepository.owner !== expected.baseRepository.owner || current.baseRepository.name !== expected.baseRepository.name
                || canonicalGitObjectId(current.baseSha) !== expectedBase
                || canonicalGitObjectId(current.headSha) !== context.prContext.prHeadSha.toLowerCase();
        }
        const currentHead = canonicalGitObjectId(await ports.getPullRequestHeadSha(context.canonicalPullRequest.number));
        if (currentHead === undefined) throw bugbotFreshnessError(undefined, boundary, operation, true);
        return currentHead !== context.prContext.prHeadSha.toLowerCase();
    } catch (error) {
        if (error instanceof PullRequestReviewOperationError || (error instanceof ApplicationError && !error.recovery
            && (error.kind === 'provider' || error.kind === 'authorization'))) throw bugbotFreshnessError(error, boundary, operation);
        throw error;
    }
}
