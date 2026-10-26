import type { BoundPullRequestReviewThreadStateQueryPort } from '../../../../ports/pull_request_review_comment_ports';
import { PullRequestReviewOperationError } from '../../../../ports/pull_request_review_errors';

/** Revalidate withdrawal at mutation time; unavailable facts never grant permission. */
export async function isReopenedFindingThreadStillOpen(
  port: Partial<BoundPullRequestReviewThreadStateQueryPort>,
  pullRequestNumber: number,
  commentIdentity: string,
): Promise<boolean> {
  if (!port.listPullRequestReviewThreadStates) throw new PullRequestReviewOperationError('list-threads');
  const thread = (await port.listPullRequestReviewThreadStates(pullRequestNumber))[commentIdentity];
  if (typeof thread?.resolved !== 'boolean') throw new PullRequestReviewOperationError('list-threads');
  return !thread.resolved;
}
