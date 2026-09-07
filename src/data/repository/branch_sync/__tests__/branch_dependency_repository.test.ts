import { BranchDependencyRepository } from "../branch_dependency_repository";

describe("BranchDependencyRepository", () => {
  it("paginates open issues and pull requests before deriving dependencies", async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({
        repository: {
          issues: {
            nodes: [{
              number: 1,
              linkedBranches: { nodes: [{ ref: { name: "feature/one" } }] },
            }],
            pageInfo: { hasNextPage: true, endCursor: "issue-2" },
          },
          pullRequests: {
            nodes: [{ number: 10, baseRefName: "develop", headRefName: "feature/one" }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          issues: {
            nodes: [{
              number: 2,
              body: `<!-- copilot-configuration-start\n${JSON.stringify({ parentBranch: "main", workingBranch: "feature/two" })}\ncopilot-configuration-end -->`,
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          pullRequests: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.listOpenDependencies("org", "repo", "token")).resolves.toEqual([
      { issueNumber: 1, parentBranch: "develop", workingBranch: "feature/one" },
      { issueNumber: 2, parentBranch: "main", workingBranch: "feature/two" },
    ]);
    expect(graphql).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      issuesCursor: "issue-2",
    }));
  });

  it("resolves a pull request target directly", async () => {
    const graphql = jest.fn().mockResolvedValue({
      repository: {
        issueOrPullRequest: {
          __typename: "PullRequest",
          number: 9,
          baseRefName: "main",
          headRefName: "topic",
        },
      },
    });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.resolveTarget("org", "repo", 9, "token")).resolves.toEqual({
      issueNumber: 9,
      conversationNumber: 9,
      parentBranch: "main",
      workingBranch: "topic",
    });
  });

  it("resolves an issue through the same open-dependency source of truth", async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({
        repository: { issueOrPullRequest: { __typename: "Issue", number: 4 } },
      })
      .mockResolvedValueOnce({
        repository: {
          issues: {
            nodes: [{
              number: 4,
              body: `<!-- copilot-configuration-start\n${JSON.stringify({ parentBranch: "develop", workingBranch: "feature/four" })}\ncopilot-configuration-end -->`,
            }],
            pageInfo: { hasNextPage: false },
          },
          pullRequests: { nodes: [], pageInfo: { hasNextPage: false } },
        },
      });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.resolveTarget("org", "repo", 4, "token")).resolves.toMatchObject({
      issueNumber: 4,
      conversationNumber: 4,
      workingBranch: "feature/four",
    });
    await expect(repository.resolveTarget("org", "repo", 0, "token")).resolves.toBeUndefined();
  });

  it("fails with a stable boundary error", async () => {
    const graphql = jest.fn().mockRejectedValue(new Error("secret provider response"));
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.listOpenDependencies("org", "repo", "token"))
      .rejects.toThrow("Unable to discover open branch dependencies from GitHub.");
    await expect(repository.resolveTarget("org", "repo", 1, "token"))
      .rejects.toThrow("Unable to resolve the branch synchronization target from GitHub.");
  });
});
