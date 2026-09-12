import { BugbotIssueCommentQueryRepository } from '../bugbot_issue_comment_query_repository';

function connection(
  startId: number,
  count: number,
  hasPreviousPage: boolean,
  startCursor: string | null,
) {
  return {
    repository: {
      issueOrPullRequest: {
        comments: {
          nodes: Array.from({ length: count }, (_, index) => ({
            databaseId: startId + index,
            body: `comment-${startId + index}`,
            author: { login: 'alice' },
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, startId + index)).toISOString(),
          })),
          pageInfo: { hasPreviousPage, startCursor },
        },
      },
    },
  };
}

describe('BugbotIssueCommentQueryRepository', () => {
  it('loads at most the newest two pages and returns them chronologically', async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce(connection(101, 100, true, 'older'))
      .mockResolvedValueOnce(connection(1, 100, true, 'oldest'));
    const repository = new BugbotIssueCommentQueryRepository({
      getClient: () => ({ graphql }),
    } as never);

    const result = await repository.listBugbotIssueCommentsBounded(
      'owner', 'repo', 7, 'token',
    );

    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[0][0]).toContain('comments(last: 100, before: $cursor)');
    expect(graphql.mock.calls[0][1]).toEqual({
      owner: 'owner', repository: 'repo', issueNumber: 7, cursor: null,
    });
    expect(graphql.mock.calls[1][1]).toEqual(expect.objectContaining({ cursor: 'older' }));
    expect(result.items).toHaveLength(200);
    expect(result.items[0].id).toBe(1);
    expect(result.items[199].id).toBe(200);
    expect(result.coverage).toEqual(expect.objectContaining({
      source: 'issue-comments',
      status: 'partial',
      pagesFetched: 2,
      limitReached: true,
      providerLimitReached: true,
    }));
  });

  it('stops after one complete page and preserves normalized metadata', async () => {
    const graphql = jest.fn().mockResolvedValue(connection(9, 1, false, null));
    const repository = new BugbotIssueCommentQueryRepository({
      getClient: () => ({ graphql }),
    } as never);

    const result = await repository.listBugbotIssueCommentsBounded(
      'owner', 'repo', 7, 'token',
    );
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 9,
      body: 'comment-9',
      user: { login: 'alice' },
      createdAt: expect.any(String),
    }));
    expect(result.coverage.status).toBe('complete');
    expect(result.coverage.providerLimitReached).toBeUndefined();
  });

  it('accepts an empty connection and normalizes absent optional fields', async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({ repository: { issueOrPullRequest: {} } })
      .mockResolvedValueOnce({
        repository: { issueOrPullRequest: { comments: {
          nodes: [{ databaseId: 5 }],
          pageInfo: { hasPreviousPage: false, startCursor: null },
        } } },
      });
    const repository = new BugbotIssueCommentQueryRepository({
      getClient: () => ({ graphql }),
    } as never);

    await expect(repository.listBugbotIssueCommentsBounded('owner', 'repo', 7, 'token'))
      .resolves.toEqual(expect.objectContaining({ items: [] }));
    await expect(repository.listBugbotIssueCommentsBounded('owner', 'repo', 7, 'token'))
      .resolves.toEqual(expect.objectContaining({ items: [{ id: 5, body: null }] }));
  });

  it('fails closed on missing cursors and invalid provider identities', async () => {
    const missingCursor = new BugbotIssueCommentQueryRepository({
      getClient: () => ({ graphql: jest.fn().mockResolvedValue(connection(1, 1, true, null)) }),
    } as never);
    await expect(missingCursor.listBugbotIssueCommentsBounded(
      'owner', 'repo', 7, 'token',
    )).rejects.toMatchObject({ code: 'provider.unavailable' });

    const invalidIdentity = new BugbotIssueCommentQueryRepository({
      getClient: () => ({
        graphql: jest.fn().mockResolvedValue({
          repository: { issueOrPullRequest: { comments: {
            nodes: [{ databaseId: null, body: 'bad' }],
            pageInfo: { hasPreviousPage: false, startCursor: null },
          } } },
        }),
      }),
    } as never);
    await expect(invalidIdentity.listBugbotIssueCommentsBounded(
      'owner', 'repo', 7, 'token',
    )).rejects.toMatchObject({ code: 'provider.unavailable' });

    const nonPositiveIdentity = new BugbotIssueCommentQueryRepository({
      getClient: () => ({ graphql: jest.fn().mockResolvedValue({
        repository: { issueOrPullRequest: { comments: {
          nodes: [{ databaseId: 0, body: 'bad' }],
          pageInfo: { hasPreviousPage: false, startCursor: null },
        } } },
      }) }),
    } as never);
    await expect(nonPositiveIdentity.listBugbotIssueCommentsBounded(
      'owner', 'repo', 7, 'token',
    )).rejects.toMatchObject({ code: 'provider.unavailable' });
  });
});
