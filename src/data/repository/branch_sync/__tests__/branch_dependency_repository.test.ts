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
              body: `<!-- copilot-configuration-start\n${JSON.stringify({ schemaVersion: 3, parentBranch: "main", workingBranch: "feature/two" })}\ncopilot-configuration-end -->`,
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

  it("continues pull-request pagination independently and ignores nullable GraphQL nodes", async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({
        repository: {
          issues: { nodes: [null], pageInfo: { hasNextPage: false, endCursor: null } },
          pullRequests: { nodes: [null], pageInfo: { hasNextPage: true, endCursor: "pull-2" } },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          pullRequests: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.listOpenDependencies("org", "repo", "token")).resolves.toEqual([]);
    expect(graphql).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      issuesCursor: undefined,
      pullsCursor: "pull-2",
    }));
  });

  it("stops pagination when GitHub marks a page as next but omits its cursor", async () => {
    const graphql = jest.fn().mockResolvedValue({
      repository: {
        issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
        pullRequests: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      },
    });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.listOpenDependencies("org", "repo", "token")).resolves.toEqual([]);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("treats omitted issue and pull-request collections as empty", async () => {
    const graphql = jest.fn().mockResolvedValue({ repository: {} });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.listOpenDependencies("org", "repo", "token")).resolves.toEqual([]);
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
              body: `<!-- copilot-configuration-start\n${JSON.stringify({ schemaVersion: 3, parentBranch: "develop", workingBranch: "feature/four" })}\ncopilot-configuration-end -->`,
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

  it("returns no target when the conversation or issue dependency is unavailable", async () => {
    const missingConversation = jest.fn().mockResolvedValue({ repository: null });
    const missingRepository = new BranchDependencyRepository({
      getClient: () => ({ graphql: missingConversation }),
    });
    await expect(missingRepository.resolveTarget("org", "repo", 4, "token")).resolves.toBeUndefined();

    const missingDependency = jest.fn()
      .mockResolvedValueOnce({ repository: { issueOrPullRequest: { __typename: "Issue", number: 4 } } })
      .mockResolvedValueOnce({
        repository: {
          issues: { nodes: [], pageInfo: { hasNextPage: false } },
          pullRequests: { nodes: [], pageInfo: { hasNextPage: false } },
        },
      });
    const issueRepository = new BranchDependencyRepository({ getClient: () => ({ graphql: missingDependency }) });
    await expect(issueRepository.resolveTarget("org", "repo", 4, "token")).resolves.toBeUndefined();
  });

  it("fails stably when GitHub omits the repository from dependency discovery", async () => {
    const graphql = jest.fn().mockResolvedValue({ repository: null });
    const repository = new BranchDependencyRepository({ getClient: () => ({ graphql }) });

    await expect(repository.listOpenDependencies("org", "repo", "token"))
      .rejects.toThrow("Unable to discover open branch dependencies from GitHub.");
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
