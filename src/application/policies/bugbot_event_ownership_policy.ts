import type { BugbotPullRequestIdentity } from '../../domain/bugbot/context';

export interface BugbotEventOwnershipContext {
  readonly triggerKind: string;
  readonly eventTargetsPullRequest: boolean;
  readonly selectionReason: 'event' | 'exact-head' | 'none';
  readonly canonicalPullRequest: BugbotPullRequestIdentity | null;
}

/**
 * Automatic push review yields only after an exact-head provider lookup proves
 * that an open same-repository pull request owns the branch revision.
 */
export function selectPullRequestOwnerForPushReview(
  context: BugbotEventOwnershipContext,
): BugbotPullRequestIdentity | null {
  const pullRequestOwnsReview = context.triggerKind === 'push'
    && !context.eventTargetsPullRequest
    && context.selectionReason === 'exact-head'
    && context.canonicalPullRequest !== null;
  return pullRequestOwnsReview ? context.canonicalPullRequest : null;
}
