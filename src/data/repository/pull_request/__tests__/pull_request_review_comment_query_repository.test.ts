import { PullRequestReviewCommentQueryRepository } from "../pull_request_review_comment_query_repository";

describe("PullRequestReviewCommentQueryRepository", () => {
  it("maps every paginated review-comment page and preserves nullable fields", async () => {
    const listReviewComments = jest.fn();
    const iterator = jest.fn(async function* () {
      yield {
        data: [
          {
            id: 1,
            body: null,
            path: "src/first.ts",
            line: null,
            node_id: "node-1",
            pull_request_review_id: 77,
            html_url: 'https://github.com/org/repo/pull/21#discussion_r1',
          },
        ],
      };
      yield {
        data: [
          {
            id: 2,
            body: "Second",
            path: "src/second.ts",
            line: 42,
            node_id: "node-2",
          },
        ],
      };
    });
    const getClient = jest.fn(() => ({
      paginate: { iterator },
      rest: {
        pulls: {
          listReviewComments,
          getReviewComment: jest.fn(),
        },
      },
    }));
    const repository = new PullRequestReviewCommentQueryRepository({
      getClient,
    } as never);

    await expect(
      repository.listPullRequestReviewComments("owner", "repo", 21, "token"),
    ).resolves.toEqual([
      {
        id: 1,
        identity: "node-1",
        body: null,
        path: "src/first.ts",
        line: undefined,
        parentReviewIdentity: '77',
        url: 'https://github.com/org/repo/pull/21#discussion_r1',
      },
      {
        id: 2,
        identity: "node-2",
        body: "Second",
        path: "src/second.ts",
        line: 42,
      },
    ]);

    expect(getClient).toHaveBeenCalledTimes(1);
    expect(iterator).toHaveBeenCalledWith(listReviewComments, {
      owner: "owner",
      repo: "repo",
      pull_number: 21,
      per_page: 100,
    });
  });

  it('maps paginated parent reviews with opaque identities and URLs', async () => {
    const listReviews = jest.fn();
    const iterator = jest.fn(async function* () {
      yield {
        data: [{
          id: 77,
          body: 'Review body',
          user: { login: 'bugbot' },
          commit_id: 'abc1234',
          html_url: 'https://github.com/org/repo/pull/21#pullrequestreview-77',
        }],
      };
    });
    const repository = new PullRequestReviewCommentQueryRepository({
      getClient: () => ({
        paginate: { iterator },
        rest: { pulls: { listReviews } },
      }),
    } as never);

    await expect(
      repository.listPullRequestReviews('owner', 'repo', 21, 'token'),
    ).resolves.toEqual([{
      identity: '77',
      body: 'Review body',
      authorLogin: 'bugbot',
      commitId: 'abc1234',
      url: 'https://github.com/org/repo/pull/21#pullrequestreview-77',
    }]);
    expect(iterator).toHaveBeenCalledWith(listReviews, {
      owner: 'owner',
      repo: 'repo',
      pull_number: 21,
      per_page: 100,
    });
  });

  it('rejects malformed review identities through a sanitized operation error', async () => {
    const iterator = jest.fn(async function* () {
      yield { data: [{ id: 0, body: 'bad' }] };
    });
    const repository = new PullRequestReviewCommentQueryRepository({
      getClient: () => ({
        paginate: { iterator },
        rest: { pulls: { listReviews: jest.fn() } },
      }),
    } as never);
    await expect(
      repository.listPullRequestReviews('owner', 'repo', 21, 'token'),
    ).rejects.toThrow('Unable to list pull request reviews.');
  });

  it("returns a nullable comment body from the point lookup", async () => {
    const getReviewComment = jest.fn().mockResolvedValue({
      data: { id: 99, body: null },
    });
    const getClient = jest.fn(() => ({
      rest: { pulls: { getReviewComment } },
    }));
    const repository = new PullRequestReviewCommentQueryRepository({
      getClient,
    } as never);

    await expect(
      repository.getPullRequestReviewCommentBody(
        "owner",
        "repo",
        21,
        99,
        "token",
      ),
    ).resolves.toBeNull();

    expect(getReviewComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 99,
    });
  });

  it("translates paginated comment-list failures before they cross the port", async () => {
    const failure = new Error("comments unavailable secret-token");
    const iterator = jest.fn(async function* () {
      if (failure) throw failure;
      yield { data: [] };
    });
    const listReviewComments = jest.fn();
    const getClient = jest.fn(() => ({
      paginate: { iterator },
      rest: { pulls: { listReviewComments } },
    }));
    const repository = new PullRequestReviewCommentQueryRepository({
      getClient,
    } as never);

    await expect(
      repository.listPullRequestReviewComments("owner", "repo", 21, "token"),
    ).rejects.toThrow("Unable to list pull request review comments.");
  });

  it("translates point-lookup failures before they cross the port", async () => {
    const getReviewComment = jest
      .fn()
      .mockRejectedValue(new Error("comment lookup failed secret-token"));
    const getClient = jest.fn(() => ({
      rest: { pulls: { getReviewComment } },
    }));
    const repository = new PullRequestReviewCommentQueryRepository({
      getClient,
    } as never);

    await expect(
      repository.getPullRequestReviewCommentBody(
        "owner",
        "repo",
        21,
        99,
        "token",
      ),
    ).rejects.toThrow("Unable to get the pull request review comment.");
  });
});
