import type { BugbotReconciliationTarget } from '../../../../../contracts/bugbot_reconciliation';
import { loadBugbotReconciliationSnapshot } from '../load_bugbot_reconciliation_snapshot_use_case';

const head = 'a'.repeat(40);

function target(overrides: Partial<BugbotReconciliationTarget> = {}): BugbotReconciliationTarget {
  return {
    owner: 'org',
    repository: 'repo',
    pullRequestNumber: 10,
    linkedIssueNumber: 20,
    analyzedHeadSha: head,
    trustedAuthorLogin: 'bugbot',
    locale: 'en-US',
    ...overrides,
  };
}

function harness() {
  const getPullRequestHeadSha = jest.fn().mockResolvedValue(head);
  const listPullRequestReviewComments = jest.fn().mockResolvedValue([]);
  const listPullRequestReviewThreadStates = jest.fn().mockResolvedValue({});
  const listPullRequestReviews = jest.fn().mockResolvedValue([]);
  const listIssueComments = jest.fn().mockImplementation(
    (_owner: string, _repository: string, number: number) =>
      Promise.resolve([{ id: number, body: null }]),
  );
  const forPullRequest = jest.fn().mockReturnValue({
    pullRequestUrl: 'https://example.test/org/repo/pull/10',
    commitUrl: `https://example.test/org/repo/commit/${head}`,
  });
  return {
    ports: {
      issueComments: { listIssueComments },
      pullRequest: {
        getPullRequestHeadSha,
        listPullRequestReviewComments,
        listPullRequestReviewThreadStates,
      },
      reviews: { listPullRequestReviews },
      navigation: { forPullRequest },
    },
    getPullRequestHeadSha,
    listPullRequestReviewComments,
    listPullRequestReviewThreadStates,
    listPullRequestReviews,
    listIssueComments,
    forPullRequest,
  };
}

describe('loadBugbotReconciliationSnapshot', () => {
  it('returns a complete snapshot protected by two head guards', async () => {
    const test = harness();

    const result = await loadBugbotReconciliationSnapshot(
      target(),
      { token: 'token' },
      test.ports,
    );

    expect(result).toEqual(expect.objectContaining({ kind: 'current' }));
    if (result.kind !== 'current') throw new Error('Expected a current snapshot.');
    expect(result.snapshot.completeness).toEqual({
      linkedIssueComments: 'verified',
      pullRequestComments: 'verified',
      reviewThreads: 'verified',
      reviews: 'verified',
      conversation: 'verified',
      navigation: 'verified',
    });
    expect(result.snapshot.conversationComments).toEqual([{ id: 10, body: null }]);
    expect(result.snapshot.linkedIssueComments).toEqual([{ id: 20, body: null }]);
    expect(test.getPullRequestHeadSha).toHaveBeenCalledTimes(2);
  });

  it('reuses the conversation read when the linked issue is the pull request', async () => {
    const test = harness();

    const result = await loadBugbotReconciliationSnapshot(
      target({ linkedIssueNumber: 10 }),
      { token: 'token' },
      test.ports,
    );

    if (result.kind !== 'current') throw new Error('Expected a current snapshot.');
    expect(test.listIssueComments).toHaveBeenCalledTimes(1);
    expect(result.snapshot.linkedIssueComments)
      .toBe(result.snapshot.conversationComments);
  });

  it('marks an absent linked issue as not applicable without reading it', async () => {
    const test = harness();

    const result = await loadBugbotReconciliationSnapshot(
      target({ linkedIssueNumber: undefined }),
      { token: 'token' },
      test.ports,
    );

    if (result.kind !== 'current') throw new Error('Expected a current snapshot.');
    expect(result.snapshot.completeness.linkedIssueComments).toBe('not-applicable');
    expect(result.snapshot.linkedIssueComments).toEqual([]);
    expect(test.listIssueComments).toHaveBeenCalledTimes(1);
  });

  it('preserves independent surface failures without exposing provider errors', async () => {
    const test = harness();
    test.listPullRequestReviewComments.mockRejectedValue(new Error('private comments failure'));
    test.listPullRequestReviews.mockRejectedValue(new Error('private reviews failure'));

    const result = await loadBugbotReconciliationSnapshot(
      target(),
      { token: 'token' },
      test.ports,
    );

    if (result.kind !== 'current') throw new Error('Expected a current snapshot.');
    expect(result.snapshot.pullRequestComments).toEqual([]);
    expect(result.snapshot.reviews).toEqual([]);
    expect(result.snapshot.completeness.pullRequestComments).toBe('failed');
    expect(result.snapshot.completeness.reviews).toBe('failed');
  });

  it('discards a snapshot when the head changes during acquisition', async () => {
    const test = harness();
    test.getPullRequestHeadSha
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce('b'.repeat(40));

    const result = await loadBugbotReconciliationSnapshot(
      target(),
      { token: 'token' },
      test.ports,
    );

    expect(result).toEqual({ kind: 'superseded', verifiedHeadSha: 'b'.repeat(40) });
    expect(test.forPullRequest).not.toHaveBeenCalled();
  });

  it('skips surface reads when the initial head is already superseded', async () => {
    const test = harness();
    test.getPullRequestHeadSha.mockResolvedValue('b'.repeat(40));

    const result = await loadBugbotReconciliationSnapshot(
      target(),
      { token: 'token' },
      test.ports,
    );

    expect(result.kind).toBe('superseded');
    expect(test.listPullRequestReviewComments).not.toHaveBeenCalled();
    expect(test.listIssueComments).not.toHaveBeenCalled();
  });

  it('maps head read failures to the semantic review operation error', async () => {
    const test = harness();
    test.getPullRequestHeadSha.mockRejectedValue(new Error('private provider detail'));

    await expect(loadBugbotReconciliationSnapshot(
      target(),
      { token: 'token' },
      test.ports,
    )).rejects.toThrow('Unable to get the pull request head commit.');
  });

  it('marks navigation failure independently and retains the data snapshot', async () => {
    const test = harness();
    test.forPullRequest.mockImplementation(() => {
      throw new Error('unsafe URL');
    });

    const result = await loadBugbotReconciliationSnapshot(
      target(),
      { token: 'token' },
      test.ports,
    );

    if (result.kind !== 'current') throw new Error('Expected a current snapshot.');
    expect(result.snapshot.navigation).toBeUndefined();
    expect(result.snapshot.completeness.navigation).toBe('failed');
    expect(result.snapshot.completeness.pullRequestComments).toBe('verified');
  });
});
