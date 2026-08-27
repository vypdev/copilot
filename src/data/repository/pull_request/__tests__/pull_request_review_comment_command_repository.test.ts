import { PullRequestReviewOperationError } from "../../../../application/ports/pull_request_review_errors";
import { PullRequestReviewCommentCommandRepository } from "../pull_request_review_comment_command_repository";

function createRepository(options: {
  createReviewComment?: jest.Mock;
  graphql?: jest.Mock;
  createClientError?: Error;
  graphqlClientError?: Error;
  existingBodies?: string[];
}) {
  const createClient = {
    getClient: jest.fn(() => {
      if (options.createClientError) throw options.createClientError;
      return {
        rest: {
          pulls: {
            createReviewComment:
              options.createReviewComment ?? jest.fn(),
          },
        },
      };
    }),
  };
  const graphqlClient = {
    getClient: jest.fn(() => {
      if (options.graphqlClientError) throw options.graphqlClientError;
      return { graphql: options.graphql ?? jest.fn() };
    }),
  };
  const queryClient = {
    getClient: jest.fn(() => ({
      paginate: {
        iterator: async function* () {
          yield {
            data: (options.existingBodies ?? []).map((body) => ({ body })),
          };
        },
      },
      rest: { pulls: { listReviewComments: jest.fn() } },
    })),
  };

  return {
    repository: new PullRequestReviewCommentCommandRepository(
      createClient as never,
      graphqlClient as never,
      queryClient as never,
    ),
    createClient,
    graphqlClient,
  };
}

describe("PullRequestReviewCommentCommandRepository", () => {
  it("does not resolve a provider client for an empty review", async () => {
    const { repository, createClient } = createRepository({});

    await repository.createReviewWithComments(
      "owner",
      "repo",
      7,
      "sha",
      [],
      "token",
    );

    expect(createClient.getClient).not.toHaveBeenCalled();
  });

  it("publishes every inline comment while preserving request semantics", async () => {
    const createReviewComment = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const { repository } = createRepository({ createReviewComment });
    const comments = Array.from({ length: 101 }, (_, index) => ({
      path: "src/example.ts",
      line: index + 1,
      body: `comment ${index}`,
    }));

    await repository.createReviewWithComments(
      "owner",
      "repo",
      7,
      "sha",
      comments,
      "token",
    );

    expect(createReviewComment).toHaveBeenCalledTimes(101);
    expect(createReviewComment.mock.calls[0][0]).toEqual({
      owner: "owner",
      repo: "repo",
      pull_number: 7,
      commit_id: "sha",
      body: "comment 0",
      path: "src/example.ts",
      line: 1,
      side: "RIGHT",
    });
    expect(createReviewComment.mock.calls[100][0]).toMatchObject({
      line: 101,
      body: "comment 100",
    });
  });

  it("reports the exact partial failure count without leaking provider errors", async () => {
    const createReviewComment = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 1 } })
      .mockRejectedValueOnce(new Error("provider failed secret-token"))
      .mockResolvedValueOnce({ data: { id: 3 } });
    const { repository } = createRepository({ createReviewComment });

    await expect(
      repository.createReviewWithComments(
        "owner",
        "repo",
        7,
        "sha",
        [
          { path: "src/a.ts", line: 1, body: "one" },
          { path: "src/a.ts", line: 2, body: "two" },
          { path: "src/a.ts", line: 3, body: "three" },
        ],
        "token",
      ),
    ).rejects.toMatchObject({
      name: "PullRequestReviewOperationError",
      operation: "publish-comments",
      message: "Failed to publish 1 of 3 pull request review comments.",
    });
    expect(createReviewComment).toHaveBeenCalledTimes(3);
  });

  it("updates a review comment by opaque identity through the exact GraphQL mutation", async () => {
    const identity = "PRRC_9223372036854775807";
    const graphql = jest.fn().mockResolvedValue({
      updatePullRequestReviewComment: {
        pullRequestReviewComment: { id: identity },
      },
    });
    const { repository, graphqlClient } = createRepository({ graphql });

    await repository.updatePullRequestReviewComment(
      "owner",
      "repo",
      identity,
      "updated body",
      "token",
    );

    expect(graphqlClient.getClient).toHaveBeenCalledWith("token");
    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining("updatePullRequestReviewComment"),
      { commentIdentity: identity, body: "updated body" },
    );
    const mutation = graphql.mock.calls[0][0] as string;
    expect(mutation).toContain("pullRequestReviewCommentId: $commentIdentity");
    expect(mutation).toContain("pullRequestReviewComment { id }");
  });

  it("rejects a mismatched update confirmation with an exact sanitized error", async () => {
    const graphql = jest.fn().mockResolvedValue({
      updatePullRequestReviewComment: {
        pullRequestReviewComment: { id: "PRRC_other" },
      },
    });
    const { repository } = createRepository({ graphql });

    let caught: unknown;
    try {
      await repository.updatePullRequestReviewComment(
        "owner",
        "repo",
        "PRRC_target",
        "body",
        "secret-token",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PullRequestReviewOperationError);
    expect(caught).toMatchObject({
      name: "PullRequestReviewOperationError",
      operation: "update-comment",
      message: "Unable to update the pull request review comment.",
    });
    expect(caught).not.toHaveProperty("cause");
    expect(JSON.stringify(caught)).not.toContain("secret-token");
  });

  it("skips comments already confirmed by provider state after a partial failure", async () => {
    const createReviewComment = jest.fn().mockResolvedValue({ data: { id: 2 } });
    const { repository } = createRepository({
      createReviewComment,
      existingBodies: ["already-created"],
    });

    await repository.createReviewWithComments(
      "owner",
      "repo",
      7,
      "sha",
      [
        { path: "src/example.ts", line: 1, body: "already-created" },
        { path: "src/example.ts", line: 2, body: "pending" },
      ],
      "token",
    );

    expect(createReviewComment).toHaveBeenCalledTimes(1);
    expect(createReviewComment.mock.calls[0][0].body).toBe("pending");
  });

  it("sanitizes provider failures without preserving their cause", async () => {
    const graphql = jest
      .fn()
      .mockRejectedValue(new Error("provider failed secret-token"));
    const { repository } = createRepository({ graphql });

    await expect(
      repository.updatePullRequestReviewComment(
        "owner",
        "repo",
        "PRRC_target",
        "body",
        "token",
      ),
    ).rejects.toMatchObject({
      name: "PullRequestReviewOperationError",
      operation: "update-comment",
      message: "Unable to update the pull request review comment.",
    });

    try {
      await repository.updatePullRequestReviewComment(
        "owner",
        "repo",
        "PRRC_target",
        "body",
        "token",
      );
    } catch (error) {
      expect(error).not.toHaveProperty("cause");
      expect(JSON.stringify(error)).not.toContain("secret-token");
    }
  });
});
