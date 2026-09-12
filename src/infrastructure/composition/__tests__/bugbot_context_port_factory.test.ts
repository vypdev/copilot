import { BugbotContextPortFactory } from '../bugbot_context_port_factory';

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

describe('Bugbot context port factory', () => {
  it('binds repository identity and credentials once and forwards bounded reads', async () => {
    const issues = { listBugbotIssueCommentsBounded: jest.fn().mockResolvedValue({ items: [], coverage: coverage('issue-comments') }) };
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
    const rules = { loadRules: jest.fn().mockResolvedValue([]) };
    const ports = new BugbotContextPortFactory(
      issues as never,
      lifecycle as never,
      changes as never,
      reviewComments as never,
      reviewThreads as never,
      rules,
    ).bind({ owner: 'base-owner', repository: 'repo', token: 'secret' });

    await ports.getPullRequest(7);
    await ports.findOpenPullRequestsByExactHead('fork-owner', 'feature');
    await ports.listIssueComments(11);
    await ports.listPullRequestReviewComments(7);
    await ports.listPullRequestReviewThreadStates(7);
    await ports.getReviewDiffSnapshot(7);
    await ports.getPullRequestHeadSha(7);
    await ports.loadRules(['src/a.ts']);

    expect(lifecycle.getBugbotPullRequestIdentity).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(lifecycle.findOpenBugbotPullRequestsByExactHead).toHaveBeenCalledWith('base-owner', 'repo', 'fork-owner', 'feature', 'secret');
    expect(issues.listBugbotIssueCommentsBounded).toHaveBeenCalledWith('base-owner', 'repo', 11, 'secret');
    expect(reviewComments.listBugbotPullRequestReviewCommentsBounded).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(reviewThreads.listBugbotPullRequestReviewThreadStatesBounded).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(changes.getBoundedBugbotReviewDiffSnapshot).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(changes.getPullRequestHeadSha).toHaveBeenCalledWith('base-owner', 'repo', 7, 'secret');
    expect(rules.loadRules).toHaveBeenCalledWith(['src/a.ts']);
    expect(JSON.stringify(ports)).not.toContain('secret');
  });
});
