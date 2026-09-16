import type { BugbotPullRequestIdentity } from '../../../domain/bugbot/context';
import { selectPullRequestOwnerForPushReview } from '../bugbot_event_ownership_policy';

const pullRequest: BugbotPullRequestIdentity = {
  number: 42,
  state: 'open',
  baseRepository: { owner: 'owner', name: 'repo' },
  headRepositoryOwner: 'owner',
  headRef: 'feature/42',
  headSha: 'a'.repeat(40),
};

describe('Bugbot event ownership policy', () => {
  it('yields an automatic push review after exact-head PR verification', () => {
    expect(selectPullRequestOwnerForPushReview({
      triggerKind: 'push',
      eventTargetsPullRequest: false,
      selectionReason: 'exact-head',
      canonicalPullRequest: pullRequest,
    })).toEqual(pullRequest);
  });

  it.each([
    ['push without an open PR', 'push', false, 'none', null],
    ['pull request event', 'pull_request', true, 'event', pullRequest],
    ['on-demand review', 'workflow_dispatch', false, 'exact-head', pullRequest],
  ] as const)('keeps review ownership for %s', (
    _scenario,
    triggerKind,
    eventTargetsPullRequest,
    selectionReason,
    canonicalPullRequest,
  ) => {
    expect(selectPullRequestOwnerForPushReview({
      triggerKind,
      eventTargetsPullRequest,
      selectionReason,
      canonicalPullRequest,
    })).toBeNull();
  });
});
