import { GithubDeploymentRepository } from "../github_deployment_repository";
import type { GithubDeploymentClient, GithubDeploymentPullRequest } from "../../../../infrastructure/github/ports/github_deployment_provider_port";

const pullRequest = (overrides: Partial<GithubDeploymentPullRequest> = {}): GithubDeploymentPullRequest => ({
  number: 40,
  node_id: "PR_node",
  body: '<!-- copilot-deployment operation-id="operation-12345678" phase="promotion" issue="355" -->',
  state: "open",
  merged: false,
  head: { ref: "release/3.4.0", sha: "a".repeat(40), repo: { full_name: "owner/repo" } },
  base: { ref: "master", repo: { full_name: "owner/repo" } },
  ...overrides,
});

function harness() {
  const pulls = {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    merge: jest.fn(),
  };
  const repos = {
    get: jest.fn().mockResolvedValue({ data: { allow_auto_merge: true } }),
    getBranchProtection: jest.fn().mockResolvedValue({ data: { required_status_checks: { strict: true } } }),
    compareCommits: jest.fn(),
    listBranches: jest.fn(),
    merge: jest.fn(),
  };
  const git = {
    getRef: jest.fn(),
    createRef: jest.fn(),
    deleteRef: jest.fn(),
  };
  const graphql = jest.fn().mockResolvedValue({ repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
  const paginate = jest.fn();
  const client = { graphql, paginate, rest: { pulls, repos, git } } as unknown as GithubDeploymentClient;
  return { repository: new GithubDeploymentRepository({ getClient: () => client }), client, pulls, repos, git, graphql, paginate };
}

const query = {
  owner: "owner",
  repository: "repo",
  operationId: "operation-12345678",
  phase: "promotion" as const,
  issue: 355,
  headBranch: "release/3.4.0",
  baseBranch: "master",
  token: "token",
};

describe("GitHub deployment repository", () => {
  it("finds a PR only through the exact managed marker", async () => {
    const value = harness();
    value.paginate.mockResolvedValue([
      pullRequest(),
      pullRequest({ number: 41, body: '<!-- copilot-deployment operation-id="another-12345678" phase="promotion" issue="355" -->' }),
    ]);
    await expect(value.repository.findManagedPullRequests(query)).resolves.toEqual([expect.objectContaining({ number: 40 })]);
  });

  it("does not reuse a PR identified only by its branches", async () => {
    const value = harness();
    value.paginate.mockResolvedValue([pullRequest({ body: "same title and branches" })]);
    await expect(value.repository.findManagedPullRequests(query)).resolves.toEqual([]);
  });

  it("creates a same-repository managed PR without maintainer head mutation", async () => {
    const value = harness();
    value.pulls.create.mockResolvedValue({ data: pullRequest() });
    await value.repository.createManagedPullRequest({ ...query, title: "release: promote", body: pullRequest().body! });
    expect(value.pulls.create).toHaveBeenCalledWith(expect.objectContaining({
      head: "release/3.4.0", base: "master", maintainer_can_modify: false,
    }));
  });

  it("maps authoritative merged PR state", async () => {
    const value = harness();
    value.pulls.get.mockResolvedValue({ data: pullRequest({ state: "closed", merged: true, merge_commit_sha: "c".repeat(40) }) });
    await expect(value.repository.getPullRequest("owner", "repo", 40, "token"))
      .resolves.toEqual(expect.objectContaining({ state: "closed", merged: true, mergeCommitSha: "c".repeat(40) }));
  });

  it("reads auto-merge, queue and strict target capabilities", async () => {
    const value = harness();
    value.graphql.mockResolvedValue({ repository: { ref: { branchProtectionRule: { requiresMergeQueue: true } } } });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual({ autoMergeAllowed: true, mergeQueueRequired: true, immediatelyMergeable: false, requiresStrictStatusChecks: true });
  });

  it("reports an immediately mergeable managed PR only when GitHub marks it clean", async () => {
    const value = harness();
    value.pulls.get.mockResolvedValue({ data: pullRequest({ mergeable: true, mergeable_state: "clean" }) });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token", 40))
      .resolves.toEqual(expect.objectContaining({ immediatelyMergeable: true }));
  });

  it("treats an unprotected branch as non-strict", async () => {
    const value = harness();
    value.repos.getBranchProtection.mockRejectedValue({ status: 404 });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "develop", "token"))
      .resolves.toEqual(expect.objectContaining({ requiresStrictStatusChecks: false }));
  });

  it("enables merge-commit auto-merge through GraphQL", async () => {
    const value = harness();
    await value.repository.enableAutoMerge("owner", "repo", "PR_node", "token");
    expect(value.graphql).toHaveBeenCalledWith(expect.stringContaining("enablePullRequestAutoMerge"), expect.objectContaining({ pullRequestId: "PR_node" }));
  });

  it("enqueues a managed PR through GraphQL", async () => {
    const value = harness();
    await value.repository.enqueuePullRequest("owner", "repo", "PR_node", "token");
    expect(value.graphql).toHaveBeenCalledWith(expect.stringContaining("enqueuePullRequest"), expect.objectContaining({ pullRequestId: "PR_node" }));
  });

  it("rejects a merge that GitHub did not perform", async () => {
    const value = harness();
    value.pulls.merge.mockResolvedValue({ data: { merged: false, message: "checks pending" } });
    await expect(value.repository.mergePullRequest("owner", "repo", 40, "token")).rejects.toThrow("checks pending");
  });

  it("verifies reachability from the merge base", async () => {
    const value = harness();
    value.repos.compareCommits.mockResolvedValue({ data: { merge_base_commit: { sha: "a".repeat(40) } } });
    await expect(value.repository.isCommitReachable("owner", "repo", "master", "a".repeat(40), "token")).resolves.toBe(true);
  });

  it("creates a missing reconciliation ref at an exact SHA", async () => {
    const value = harness();
    value.git.getRef.mockRejectedValue({ status: 404 });
    await value.repository.createOrVerifyBranch("owner", "repo", "sync/release", "a".repeat(40), "token");
    expect(value.git.createRef).toHaveBeenCalledWith({ owner: "owner", repo: "repo", ref: "refs/heads/sync/release", sha: "a".repeat(40) });
  });

  it("blocks an existing reconciliation ref at another SHA", async () => {
    const value = harness();
    value.git.getRef.mockResolvedValue({ data: { object: { sha: "b".repeat(40) } } });
    value.repos.compareCommits.mockResolvedValue({ data: { merge_base_commit: { sha: "b".repeat(40) } } });
    await expect(value.repository.createOrVerifyBranch("owner", "repo", "sync/release", "a".repeat(40), "token"))
      .rejects.toThrow("different SHA");
  });

  it("merges the trusted source SHA into an ephemeral branch", async () => {
    const value = harness();
    value.repos.compareCommits.mockResolvedValue({ data: { merge_base_commit: { sha: "f".repeat(40) } } });
    value.repos.merge.mockResolvedValue({ data: { merged: true, sha: "c".repeat(40) } });
    await expect(value.repository.mergeCommitIntoBranch("owner", "repo", "sync/release", "a".repeat(40), "token"))
      .resolves.toBe("c".repeat(40));
  });

  it("reuses an advanced sync branch that still contains its target base", async () => {
    const value = harness();
    value.git.getRef.mockResolvedValue({ data: { object: { sha: "e".repeat(40) } } });
    value.repos.compareCommits.mockResolvedValue({ data: { merge_base_commit: { sha: "a".repeat(40) } } });
    await expect(value.repository.createOrVerifyBranch("owner", "repo", "sync/release", "a".repeat(40), "token")).resolves.toBeUndefined();
    expect(value.git.createRef).not.toHaveBeenCalled();
  });

  it("does not re-merge a source already reachable from a sync branch", async () => {
    const value = harness();
    value.repos.compareCommits.mockResolvedValue({ data: { merge_base_commit: { sha: "a".repeat(40) } } });
    value.git.getRef.mockResolvedValue({ data: { object: { sha: "e".repeat(40) } } });
    await expect(value.repository.mergeCommitIntoBranch("owner", "repo", "sync/release", "a".repeat(40), "token"))
      .resolves.toBe("e".repeat(40));
    expect(value.repos.merge).not.toHaveBeenCalled();
  });

  it("deletes a branch idempotently when it is already absent", async () => {
    const value = harness();
    value.git.deleteRef.mockRejectedValue({ status: 404 });
    await expect(value.repository.deleteBranch("owner", "repo", "sync/release", "token")).resolves.toBeUndefined();
  });

  it("filters active branches by the configured tree", async () => {
    const value = harness();
    value.paginate.mockResolvedValue([{ name: "release/3.5.0" }, { name: "feature/x" }]);
    await expect(value.repository.listBranches("owner", "repo", "release", "token")).resolves.toEqual(["release/3.5.0"]);
  });
});
