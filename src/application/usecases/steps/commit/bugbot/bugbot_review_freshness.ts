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
): Promise<boolean> {
    if (!context.prContext || !context.canonicalPullRequest) return false;
    if (context.reviewFramedSource) {
        if (!ports.getSourceBoundPullRequest) throw new BugbotReviewCompletenessError('capability');
        const current = await ports.getSourceBoundPullRequest(context.canonicalPullRequest.number);
        return !sameBugbotFramedPullRequest(context.canonicalPullRequest, current);
    }
    const currentHead = await ports.getPullRequestHeadSha(context.canonicalPullRequest.number);
    return currentHead !== undefined && currentHead.toLowerCase() !== context.prContext.prHeadSha.toLowerCase();
}
