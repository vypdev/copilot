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
    coverage: { status: 'complete', sources: [] },
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
      updatePullRequestReview,
    },
    addComment,
    updateComment,
    updatePullRequestReview,
  };
}

function staleReviewSnapshot(count: number): BugbotReconciliationSnapshot {
  const marker = buildMarker('historical-finding', false, 'fp-11111111', 'sf-11111111');
  return snapshot({
    pullRequestComments: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      identity: `PRRC_${index + 1}`,
      parentReviewIdentity: String(index + 1),
      authorLogin: 'bugbot',
      body: marker,
    })),
    reviews: Array.from({ length: count }, (_, index) => ({
      identity: String(index + 1),
      authorLogin: 'bugbot',
      body: 'old',
      commitId: head,
    })),
  });
}

describe('synchronizeBugbotReviewPresentation', () => {
  it('does not mutate presentation when trusted navigation is unavailable', async () => {
    const test = harness();
    const currentSnapshot = snapshot({ navigation: undefined });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
      snapshot: currentSnapshot,
      plan: plan({ diagnostics: [{ code: 'snapshot-navigation-failed' }] }),
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
      snapshot: snapshot(),
      plan: plan(),
      ports: test.ports,
    });

    expect(result.statusCardOperation).toBe('created');
    expect(result.projection.outcome).toBe('complete');
    expect(test.addComment).toHaveBeenCalledWith(
      10,
      expect.stringContaining('Bugbot: review complete'),
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
      snapshot: currentSnapshot,
      plan: plan({ diagnostics: [{ code: 'snapshot-conversation-failed' }] }),
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
      snapshot: currentSnapshot,
      plan: plan({ findings: [{ id: 'finding', state: 'open', title: 'Finding' }] }),
      ports: test.ports,
    });

    expect(result.reviewUpdates).toBe(0);
    expect(result.projection.outcome).toBe('partial');
    expect(result.errors[0]?.message).toBe('Unable to update Bugbot review 77.');
    expect(test.addComment).toHaveBeenCalledWith(
      10,
      expect.stringContaining('could not fully synchronize'),
      { commitSha: head },
    );
  });

  it('repairs 42 stale reviews in sequential batches with at most four concurrent writes', async () => {
    const test = harness();
    let active = 0;
    let completed = 0;
    let maximumConcurrency = 0;
    let overlappingBatches = false;
    test.updatePullRequestReview.mockImplementation(async () => {
      const started = test.updatePullRequestReview.mock.calls.length;
      if (started > 20 && completed < 20) overlappingBatches = true;
      if (started > 40 && completed < 40) overlappingBatches = true;
      active += 1;
      maximumConcurrency = Math.max(maximumConcurrency, active);
      await Promise.resolve();
      completed += 1;
      active -= 1;
    });

    const result = await synchronizeBugbotReviewPresentation({
      target: target(), snapshot: staleReviewSnapshot(42), plan: plan(), ports: test.ports,
    });

    expect(result.reviewUpdates).toBe(42);
    expect(result.pendingReviewUpdates).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.projection.outcome).toBe('complete');
    expect(test.updatePullRequestReview).toHaveBeenCalledTimes(42);
    expect(maximumConcurrency).toBeLessThanOrEqual(4);
    expect(overlappingBatches).toBe(false);
  });

  it('caps one run at 100 attempts and reports the exact remainder as presentation pending', async () => {
    const test = harness();
    const result = await synchronizeBugbotReviewPresentation({
      target: target(), snapshot: staleReviewSnapshot(101), plan: plan(), ports: test.ports,
    });

    expect(test.updatePullRequestReview).toHaveBeenCalledTimes(100);
    expect(result.reviewUpdates).toBe(100);
    expect(result.pendingReviewUpdates).toBe(1);
    expect(result.projection.outcome).toBe('failed');
    expect(result.errors).toEqual([expect.objectContaining({
      code: 'workflow.presentation-pending',
      message: expect.stringContaining('1 Bugbot review status block'),
      recovery: { id: 'bugbot-review-blocks-pending', variables: { pendingCount: 1 } },
    })]);
    expect(test.addComment).toHaveBeenCalledWith(
      10, expect.stringContaining('1 Bugbot review status block'), { commitSha: head },
    );
  });

  it('stops after a failed batch and leaves unattempted reviews for an idempotent retry', async () => {
    const test = harness();
    const currentSnapshot = staleReviewSnapshot(42);
    const successfulBodies = new Map<string, string>();
    let firstAttempt = true;
    test.updatePullRequestReview.mockImplementation(async (_number, identity: string, body: string) => {
      if (identity === '1' && firstAttempt) throw new Error('provider failure');
      successfulBodies.set(identity, body);
    });
    const result = await synchronizeBugbotReviewPresentation({
      target: target(), snapshot: currentSnapshot, plan: plan(), ports: test.ports,
    });

    expect(test.updatePullRequestReview).toHaveBeenCalledTimes(20);
    expect(result.reviewUpdates).toBe(19);
    expect(result.pendingReviewUpdates).toBe(22);
    expect(result.projection.outcome).toBe('failed');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'Unable to update Bugbot review 1.' }),
      expect.objectContaining({ code: 'workflow.presentation-pending' }),
    ]));

    firstAttempt = false;
    test.updatePullRequestReview.mockClear();
    const retry = await synchronizeBugbotReviewPresentation({
      target: target(),
      snapshot: snapshot({
        ...currentSnapshot,
        reviews: currentSnapshot.reviews.map((review) => ({
          ...review,
          body: successfulBodies.get(review.identity) ?? review.body,
        })),
      }),
      plan: plan(),
      ports: test.ports,
    });
    expect(retry.reviewUpdates).toBe(23);
    expect(retry.pendingReviewUpdates).toBe(0);
    expect(retry.errors).toEqual([]);
    expect(test.updatePullRequestReview).toHaveBeenCalledTimes(23);
    expect(test.updatePullRequestReview.mock.calls.map((call) => call[1])).not.toContain('2');
  });

  it('renders recovery diagnostics with the same configured catalog as the status card', async () => {
    const test = harness();
    const result = await synchronizeBugbotReviewPresentation({
      target: target({ locale: 'es-MX' }),
      snapshot: snapshot(),
      plan: plan({ diagnostics: [{ code: 'snapshot-reviews-failed' }] }),
      ports: test.ports,
    });

    const body = test.addComment.mock.calls[0]?.[1] as string;
    expect(body).toContain('## Bugbot: la revisión necesita verificación');
    expect(body).toContain('No se pudieron volver a leer las revisiones del pull request.');
    expect(body).not.toContain('Unable to re-read pull request reviews.');
    expect(result.errors.map((error) => error.message)).toEqual([
      'Unable to re-read pull request reviews.',
    ]);
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
      snapshot: baseSnapshot,
      plan: currentPlan,
      ports: test.ports,
    });
    const currentBody = test.updatePullRequestReview.mock.calls[0]?.[2] as string;
    test.updatePullRequestReview.mockClear();

    const result = await synchronizeBugbotReviewPresentation({
      target: target(),
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
      snapshot: currentSnapshot,
      plan: plan(),
      ports: test.ports,
    });

    expect(result.statusCardOperation).toBe('updated');
    expect(test.updateComment).toHaveBeenCalledTimes(2);
    expect(test.updateComment).toHaveBeenCalledWith(
      10,
      3,
      expect.stringContaining('superseded by the canonical card'),
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
