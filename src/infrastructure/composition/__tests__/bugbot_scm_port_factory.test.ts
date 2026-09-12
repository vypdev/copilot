import { BugbotScmPortFactory } from '../bugbot_scm_port_factory';

const coverage = (source: string) => ({
  source,
  status: 'complete' as const,
  pagesFetched: 1,
  itemsFetched: 0,
  itemsRetained: 0,
  omittedItems: 0,
  truncatedItems: 0,
  limitReached: false,
});

describe('Bugbot SCM port factory', () => {
  it('binds repository identity and credentials once and forwards bounded reads', async () => {
    const boundedIssues = { listBugbotIssueCommentsBounded: jest.fn().mockResolvedValue({ items: [], coverage: coverage('issue-comments') }) };
    const issues = {
      listIssueComments: jest.fn().mockResolvedValue([]),
      addComment: jest.fn().mockResolvedValue(undefined),
      updateComment: jest.fn().mockResolvedValue(undefined),
    };
    const lifecycle = {
      getBugbotPullRequestIdentity: jest.fn().mockResolvedValue({ number: 7 }),
      findOpenBugbotPullRequestsByExactHead: jest.fn().mockResolvedValue([]),
    };
    const changes = {
      getBoundedBugbotReviewDiffSnapshot: jest.fn().mockResolvedValue({ snapshot: { changes: [], filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, coverage: coverage('diff') }),
      getPullRequestHeadSha: jest.fn().mockResolvedValue('head'),
    };
    const reviewComments = { listBugbotPullRequestReviewCommentsBounded: jest.fn().mockResolvedValue({ items: [], coverage: coverage('pull-request-comments') }) };
    const reviewThreads = { listBugbotPullRequestReviewThreadStatesBounded: jest.fn().mockResolvedValue({ states: {}, coverage: coverage('review-threads') }) };
    const pullRequests = {
      getPullRequestReviewCommentBody: jest.fn().mockResolvedValue(null),
      listPullRequestReviewComments: jest.fn().mockResolvedValue([]),
      listPullRequestReviewThreadStates: jest.fn().mockResolvedValue({}),
      listPullRequestReviews: jest.fn().mockResolvedValue([]),
      getPullRequestHeadSha: jest.fn().mockResolvedValue('head'),
      createReviewWithComments: jest.fn().mockResolvedValue(undefined),
      updatePullRequestReviewComment: jest.fn().mockResolvedValue(undefined),
      updatePullRequestReview: jest.fn().mockResolvedValue(undefined),
      resolvePullRequestReviewThread: jest.fn().mockResolvedValue(undefined),
      unresolvePullRequestReviewThread: jest.fn().mockResolvedValue(undefined),
    };
    const rules = { loadRules: jest.fn().mockResolvedValue([]) };
    const navigation = { forPullRequest: jest.fn() };
    const scm = new BugbotScmPortFactory(
      boundedIssues as never,
      issues as never,
      lifecycle as never,
      changes as never,
      pullRequests as never,
      reviewComments as never,
      reviewThreads as never,
      rules,
      navigation as never,
    ).bind({ owner: 'base-owner', repository: 'repo', token: 'secret' });
    const ports = scm.context;

    await ports.getPullRequest(7);
    await ports.findOpenPullRequestsByExactHead('fork-owner', 'feature');
    await ports.listIssueComments(11);
    await ports.listPullRequestReviewComments(7);
    await ports.listPullRequestReviewThreadStates(7);
    await ports.getReviewDiffSnapshot(7);
    await ports.getPullRequestHeadSha(7);
    await ports.getPullRequestReviewCommentBody(7, 99);
    await ports.loadRules(['src/a.ts']);

    expect(lifecycle.getBugbotPullRequestIdentity).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(lifecycle.findOpenBugbotPullRequestsByExactHead).toHaveBeenCalledWith('base-owner', 'repo', 'fork-owner', 'feature', 'secret');
    expect(boundedIssues.listBugbotIssueCommentsBounded).toHaveBeenCalledWith('base-owner', 'repo', 11, 'secret');
    expect(reviewComments.listBugbotPullRequestReviewCommentsBounded).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(reviewThreads.listBugbotPullRequestReviewThreadStatesBounded).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(changes.getBoundedBugbotReviewDiffSnapshot).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(changes.getPullRequestHeadSha).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(pullRequests.getPullRequestReviewCommentBody).toHaveBeenCalledWith(
      'base-owner', 'repo', 7, 99, 'secret',
    );
    expect(rules.loadRules).toHaveBeenCalledWith(['src/a.ts']);

    await scm.publication.issueComments.addComment(11, 'body');
    await scm.publication.issueComments.updateComment(11, 21, 'updated', { commitSha: 'head' });
    await scm.publication.pullRequestComments.createReviewWithComments(7, 'head', 'review', []);
    await scm.publication.pullRequestComments.updatePullRequestReviewComment('comment', 'body');
    await scm.publication.pullRequestComments.unresolvePullRequestReviewThread(7, 'thread');
    await scm.resolution.issueComments.updateComment(11, 22, 'resolved');
    await scm.resolution.pullRequestComments.listPullRequestReviewComments(7);
    await scm.resolution.pullRequestComments.updatePullRequestReviewComment('comment', 'resolved');
    await scm.resolution.pullRequestComments.resolvePullRequestReviewThread(7, 'thread');
    await scm.resolution.pullRequestComments.unresolvePullRequestReviewThread(7, 'thread');
    await scm.reconciliation.snapshot.listIssueComments(11);
    await scm.reconciliation.snapshot.listPullRequestReviewComments(7);
    await scm.reconciliation.snapshot.listPullRequestReviewThreadStates(7);
    await scm.reconciliation.snapshot.listPullRequestReviews(7);
    await scm.reconciliation.snapshot.getPullRequestHeadSha(7);
    scm.reconciliation.snapshot.navigationForPullRequest(7, 'head');
    await scm.reconciliation.presentation.comments.addComment(11, 'status');
    await scm.reconciliation.presentation.updatePullRequestReview(7, 'review-id', 'status');

    expect(issues.addComment).toHaveBeenCalledWith('base-owner', 'repo', 11, 'body', 'secret', undefined);
    expect(issues.updateComment).toHaveBeenCalledWith(
      'base-owner', 'repo', 11, 21, 'updated', 'secret', { commitSha: 'head' },
    );
    expect(pullRequests.createReviewWithComments).toHaveBeenCalledWith(
      'base-owner', 'repo', 7, 'head', 'review', [], 'secret',
    );
    expect(pullRequests.resolvePullRequestReviewThread).toHaveBeenCalledWith(
      'base-owner', 'repo', 7, 'thread', 'secret',
    );
    expect(navigation.forPullRequest).toHaveBeenCalledWith('base-owner', 'repo', 7, 'head');
    expect(pullRequests.updatePullRequestReview).toHaveBeenCalledWith(
      'base-owner', 'repo', 7, 'review-id', 'status', 'secret',
    );
    expect(JSON.stringify(scm)).not.toContain('secret');
  });
});
