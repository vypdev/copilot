import type {
  BugbotReconciliationPlan,
  BugbotReconciliationSnapshot,
  BugbotReconciliationTarget,
} from '../../../../../contracts/bugbot_reconciliation';
import { buildMarker } from '../../../../../policies/bugbot_finding_marker_policy';
import { synchronizeBugbotReviewPresentation } from '../synchronize_bugbot_review_presentation_use_case';

const head = 'a'.repeat(40);

function target(overrides: Partial<BugbotReconciliationTarget> = {}): BugbotReconciliationTarget {
  return {
    owner: 'org',
    repository: 'repo',
    pullRequestNumber: 10,
    analyzedHeadSha: head,
    trustedAuthorLogin: 'bugbot',
    locale: 'en-US',
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<BugbotReconciliationSnapshot> = {},
): BugbotReconciliationSnapshot {
  return {
    verifiedHeadSha: head,
    linkedIssueComments: [],
    pullRequestComments: [],
    reviewThreads: {},
    reviews: [],
    conversationComments: [],
    navigation: {
      pullRequestUrl: 'https://example.test/org/repo/pull/10',
      commitUrl: `https://example.test/org/repo/commit/${head}`,
    },
    completeness: {
      linkedIssueComments: 'not-applicable',
      pullRequestComments: 'verified',
      reviewThreads: 'verified',
      reviews: 'verified',
      conversation: 'verified',
      navigation: 'verified',
    },
    ...overrides,
  };
}

function plan(overrides: Partial<BugbotReconciliationPlan> = {}): BugbotReconciliationPlan {
  return {
    findings: [],
    diagnostics: [],
    ...overrides,
  };
}

function harness() {
  const addComment = jest.fn().mockResolvedValue(undefined);
  const updateComment = jest.fn().mockResolvedValue(undefined);
  const updatePullRequestReview = jest.fn().mockResolvedValue(undefined);
  return {
    ports: {
      comments: { addComment, updateComment },
      reviews: { updatePullRequestReview },
    },
    addComment,
    updateComment,
    updatePullRequestReview,
  };
}

describe('synchronizeBugbotReviewPresentation', () => {
  it('does not mutate presentation when trusted navigation is unavailable', async () => {
    const test = harness();
    const currentSnapshot = snapshot({ navigation: undefined });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: currentSnapshot,
      plan: plan({ diagnostics: ['Unable to build safe Bugbot navigation links.'] }),
      ports: test.ports,
    });

    expect(result.statusCardOperation).toBe('failed');
    expect(result.errors.map((error) => error.message)).toEqual([
      'Unable to build safe Bugbot navigation links.',
    ]);
    expect(test.addComment).not.toHaveBeenCalled();
    expect(test.updatePullRequestReview).not.toHaveBeenCalled();
  });

  it('creates the canonical status card for a verified empty conversation', async () => {
    const test = harness();
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: snapshot(),
      plan: plan(),
      ports: test.ports,
    });

    expect(result.statusCardOperation).toBe('created');
    expect(result.projection.outcome).toBe('complete');
    expect(test.addComment).toHaveBeenCalledWith(
      'org',
      'repo',
      10,
      expect.stringContaining('No active findings'),
      'token',
      { commitSha: head },
    );
  });

  it('fails closed without creating a duplicate when conversation ownership is unverified', async () => {
    const test = harness();
    const currentSnapshot = snapshot({
      completeness: { ...snapshot().completeness, conversation: 'failed' },
    });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: currentSnapshot,
      plan: plan({ diagnostics: ['Unable to re-read the pull request conversation.'] }),
      ports: test.ports,
    });

    expect(result.statusCardOperation).toBe('failed');
    expect(result.errors.map((error) => error.message)).toEqual([
      'Unable to re-read the pull request conversation.',
      'Unable to create or update the canonical Bugbot PR status card.',
    ]);
    expect(test.addComment).not.toHaveBeenCalled();
  });

  it('reports review failures while still publishing the partial canonical card', async () => {
    const test = harness();
    test.updatePullRequestReview.mockRejectedValue(new Error('private detail'));
    const findingMarker = buildMarker(
      'finding',
      false,
      'fp-11111111',
      'sf-11111111',
    );
    const currentSnapshot = snapshot({
      pullRequestComments: [{
        id: 1,
        identity: 'PRRC_1',
        parentReviewIdentity: '77',
        authorLogin: 'bugbot',
        body: findingMarker,
      }],
      reviews: [{ identity: '77', authorLogin: 'bugbot', body: 'old', commitId: head }],
    });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: currentSnapshot,
      plan: plan({ findings: [{ id: 'finding', state: 'open', title: 'Finding' }] }),
      ports: test.ports,
    });

    expect(result.reviewUpdates).toBe(0);
    expect(result.projection.outcome).toBe('partial');
    expect(result.errors[0]?.message).toBe('Unable to update Bugbot review 77.');
    expect(test.addComment).toHaveBeenCalledWith(
      'org',
      'repo',
      10,
      expect.stringContaining('could not fully synchronize'),
      'token',
      { commitSha: head },
    );
  });

  it('leaves an already-current review status block unchanged on replay', async () => {
    const test = harness();
    const findingMarker = buildMarker(
      'finding',
      false,
      'fp-11111111',
      'sf-11111111',
    );
    const baseSnapshot = snapshot({
      pullRequestComments: [{
        id: 1,
        identity: 'PRRC_1',
        parentReviewIdentity: '77',
        authorLogin: 'bugbot',
        body: findingMarker,
      }],
      reviews: [{ identity: '77', authorLogin: 'bugbot', body: 'old', commitId: head }],
    });
    const currentPlan = plan({
      findings: [{ id: 'finding', state: 'open', title: 'Finding' }],
    });
    await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: baseSnapshot,
      plan: currentPlan,
      ports: test.ports,
    });
    const currentBody = test.updatePullRequestReview.mock.calls[0]?.[4] as string;
    test.updatePullRequestReview.mockClear();

    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: snapshot({
        ...baseSnapshot,
        reviews: [{
          identity: '77',
          authorLogin: 'bugbot',
          body: currentBody,
          commitId: head,
        }],
      }),
      plan: currentPlan,
      ports: test.ports,
    });

    expect(result.reviewUpdates).toBe(0);
    expect(test.updatePullRequestReview).not.toHaveBeenCalled();
  });

  it('adopts the oldest trusted card and repairs every trusted duplicate', async () => {
    const test = harness();
    const statusMarker = `<!-- copilot-bugbot-status schema="1" pr="10" verified_head="${head}" digest="12345678" -->`;
    const currentSnapshot = snapshot({
      conversationComments: [
        { id: 3, body: `${statusMarker}\nthird`, user: { login: 'bugbot' } },
        { id: 1, body: `${statusMarker}\nfirst`, user: { login: 'bugbot' } },
        { id: 2, body: `${statusMarker}\nspoof`, user: { login: 'attacker' } },
      ],
    });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: currentSnapshot,
      plan: plan(),
      ports: test.ports,
    });

    expect(result.statusCardOperation).toBe('updated');
    expect(test.updateComment).toHaveBeenCalledTimes(2);
    expect(test.updateComment).toHaveBeenCalledWith(
      'org',
      'repo',
      10,
      3,
      expect.stringContaining('no longer current'),
      'token',
      { commitSha: head },
    );
  });

  it('aggregates duplicate cleanup failures without stopping independent repairs', async () => {
    const test = harness();
    test.updateComment
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('private duplicate failure'))
      .mockResolvedValueOnce(undefined);
    const statusMarker = `<!-- copilot-bugbot-status schema="1" pr="10" verified_head="${head}" digest="12345678" -->`;
    const currentSnapshot = snapshot({
      conversationComments: [1, 2, 3].map((id) => ({
        id,
        body: `${statusMarker}\n${id}`,
        user: { login: 'bugbot' },
      })),
    });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      credential: { token: 'token' },
      snapshot: currentSnapshot,
      plan: plan(),
      ports: test.ports,
    });

    expect(test.updateComment).toHaveBeenCalledTimes(3);
    expect(result.statusCardOperation).toBe('failed');
    expect(result.errors.map((error) => error.message)).toEqual([
      'Unable to create or update the canonical Bugbot PR status card.',
    ]);
  });
});
