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
