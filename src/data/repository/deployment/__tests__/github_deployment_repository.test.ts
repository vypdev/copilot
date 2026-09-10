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
    get: jest.fn().mockResolvedValue({ data: { id: 100, allow_auto_merge: true } }),
    getBranchProtection: jest.fn().mockResolvedValue({ data: { required_status_checks: { strict: true } } }),
    getContent: jest.fn(),
    compareCommits: jest.fn(),
    listBranches: jest.fn(),
    merge: jest.fn(),
  };
  const apps = {
    getBySlug: jest.fn().mockResolvedValue({ data: { id: 15368, slug: "github-actions" } }),
  };
  const git = {
    getRef: jest.fn(),
    createRef: jest.fn(),
    deleteRef: jest.fn(),
  };
  const graphql = jest.fn().mockImplementation((graphqlQuery: string) => {
    if (graphqlQuery.includes("DeploymentPullRequestQueue")) return { node: { mergeQueueEntry: null } };
    if (graphqlQuery.includes("EnqueueDeploymentPullRequest")) return { enqueuePullRequest: { mergeQueueEntry: { id: "queue-entry" } } };
    if (graphqlQuery.includes("DeploymentWorkflowContracts")) return { repository: { object: { entries: [] } } };
    return { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } };
  });
  const request = jest.fn().mockResolvedValue({ data: [] });
  const paginate = jest.fn();
  const client = { request, graphql, paginate, rest: { apps, pulls, repos, git } } as unknown as GithubDeploymentClient;
  return { repository: new GithubDeploymentRepository({ getClient: () => client }), client, apps, pulls, repos, git, request, graphql, paginate };
}

const workflowEntry = (content: string, name = "ci.yml") => ({
  name,
  type: "blob",
  object: { text: content, byteSize: content.length, isBinary: false },
});

const workflowContent = (content: string) => ({
  content: Buffer.from(content, "utf8").toString("base64"),
  encoding: "base64",
  size: Buffer.byteLength(content),
});

const supportedWorkflow = `
on:
  merge_group:
    types: [checks_requested]
jobs:
  check:
    name: CI Check
    runs-on: ubuntu-latest
    steps: []
`;

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
      .resolves.toEqual({
        autoMergeAllowed: true,
        mergeQueueRequired: true,
        immediatelyMergeable: false,
        requiresStrictStatusChecks: true,
        mergeQueueProducers: [],
        mergeQueueObservationProblems: [],
      });
  });

  it("reports an immediately mergeable managed PR only when GitHub marks it clean", async () => {
    const value = harness();
    value.pulls.get.mockResolvedValue({ data: pullRequest({ mergeable: true, mergeable_state: "clean" }) });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token", { pullRequest: 40 }))
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
    await value.repository.enqueuePullRequest("owner", "repo", "PR_node", "a".repeat(40), "token");
    expect(value.graphql).toHaveBeenCalledWith(expect.stringContaining("expectedHeadOid"), expect.objectContaining({
      pullRequestId: "PR_node",
      expectedHeadOid: "a".repeat(40),
    }));
  });

  it("rejects partial queue-membership and enqueue responses", async () => {
    const membership = harness();
    membership.graphql.mockResolvedValue({ node: {} });
    await expect(membership.repository.isPullRequestQueued("owner", "repo", "PR_node", "token"))
      .rejects.toThrow("no authoritative merge-queue membership");

    const enqueue = harness();
    enqueue.graphql.mockResolvedValue({ enqueuePullRequest: {} });
    await expect(enqueue.repository.enqueuePullRequest("owner", "repo", "PR_node", "a".repeat(40), "token"))
      .rejects.toThrow("did not confirm");
  });

  it("detects strict checks and merge queue from effective rulesets without classic protection", async () => {
    const value = harness();
    value.repos.getBranchProtection.mockRejectedValue({ status: 404 });
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [] } },
    ] });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual(expect.objectContaining({ mergeQueueRequired: true, requiresStrictStatusChecks: true }));
  });

  it("verifies a required GitHub Actions check on both target and candidate workflow trees", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    value.graphql.mockImplementation((graphqlQuery: string) => {
      if (graphqlQuery.includes("DeploymentWorkflowContracts")) {
        return { repository: { object: { entries: [workflowEntry(supportedWorkflow)] } } };
      }
      return { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } };
    });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token", {
      candidateHeadSha: "a".repeat(40),
    });
    expect(result.mergeQueueProducers).toEqual([
      expect.objectContaining({ name: "CI Check", support: "supported", integrationId: 15368 }),
    ]);
    expect(value.graphql).toHaveBeenCalledWith(expect.stringContaining("DeploymentWorkflowContracts"),
      expect.objectContaining({ expression: "master:.github/workflows" }));
    expect(value.graphql).toHaveBeenCalledWith(expect.stringContaining("DeploymentWorkflowContracts"),
      expect.objectContaining({ expression: `${"a".repeat(40)}:.github/workflows` }));
  });

  it("reports a GitHub Actions check as unsupported when its workflow omits merge_group", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: [workflowEntry("jobs:\n  check:\n    name: CI Check\n    runs-on: ubuntu-latest\n")] } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual(expect.objectContaining({
        mergeQueueProducers: [expect.objectContaining({ name: "CI Check", support: "unsupported" })],
      }));
  });

  it("leaves a non-GitHub Actions required check unknown for exact attestation", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "External CI", integration_id: 999 }],
      } },
    ] });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual(expect.objectContaining({
        mergeQueueProducers: [expect.objectContaining({ name: "External CI", integrationId: 999, support: "unknown" })],
      }));
  });

  it("records an observation problem when effective rules cannot be read", async () => {
    const value = harness();
    value.request.mockRejectedValue({ status: 403, message: "Forbidden github_pat_abcdefghijklmnopqrstuvwxyz123456" });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems).toEqual([
      expect.objectContaining({ area: "effective-rules", message: expect.stringContaining("Forbidden") }),
    ]);
    expect(result.mergeQueueObservationProblems[0].message).toContain("[REDACTED_SECRET]");
    expect(result.mergeQueueObservationProblems[0].message).not.toContain("github_pat_");
  });

  it("treats malformed and oversized effective-rule responses as unknown policy", async () => {
    for (const response of [
      { data: {} },
      { data: [null] },
      { data: Array.from({ length: 1_001 }, () => ({ type: "pull_request" })) },
    ]) {
      const value = harness();
      value.request.mockResolvedValue(response);
      const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
      expect(result.mergeQueueObservationProblems).toEqual([
        expect.objectContaining({ area: "effective-rules" }),
      ]);
    }
  });

  it.each([
    [{}],
    [{ type: "required_status_checks" }],
    [{ type: "required_status_checks", parameters: { required_status_checks: [null] } }],
    [{ type: "required_status_checks", parameters: {
      strict_required_status_checks_policy: "yes",
      required_status_checks: [],
    } }],
    [{ type: "workflows" }],
    [{ type: "workflows", parameters: { workflows: [null] } }],
  ])("keeps malformed effective rule entries unknown: %p", async (rule) => {
    const value = harness();
    value.request.mockResolvedValue({ data: [rule] });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "effective-rules", message: expect.stringContaining("invalid") }),
    ]));
  });

  it("fails closed when the candidate head is not a full SHA", async () => {
    const value = harness();
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token", {
      candidateHeadSha: "main",
    });
    expect(result.mergeQueueObservationProblems).toEqual([
      expect.objectContaining({ area: "workflow-contract", message: expect.stringContaining("candidate head SHA is invalid") }),
    ]);
  });

  it("fails closed when the pull request head moves during final readiness inspection", async () => {
    const value = harness();
    value.pulls.get.mockResolvedValue({ data: pullRequest({ head: {
      ref: "release/3.4.0",
      sha: "b".repeat(40),
      repo: { full_name: "owner/repo" },
    } }) });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token", {
      pullRequest: 40,
      candidateHeadSha: "a".repeat(40),
    });
    expect(result.mergeQueueObservationProblems).toEqual([
      expect.objectContaining({ area: "workflow-contract", message: expect.stringContaining("head changed") }),
    ]);
  });

  it("treats partial classic policy responses as unknown", async () => {
    const invalidProtection = harness();
    invalidProtection.repos.getBranchProtection.mockResolvedValue({ data: null });
    const protectionResult = await invalidProtection.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(protectionResult.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("invalid classic") }),
    ]));

    const missingQueueRule = harness();
    missingQueueRule.graphql.mockResolvedValue({ repository: { ref: {} } });
    const queueResult = await missingQueueRule.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(queueResult.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("omitted") }),
    ]));

    const malformedQueueRule = harness();
    malformedQueueRule.graphql.mockResolvedValue({ repository: { ref: {
      branchProtectionRule: { requiresMergeQueue: "yes" },
    } } });
    const malformedQueueResult = await malformedQueueRule.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(malformedQueueResult.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("invalid classic merge-queue") }),
    ]));

    const malformedChecks = harness();
    malformedChecks.repos.getBranchProtection.mockResolvedValue({ data: {
      required_status_checks: {
        strict: "true",
        checks: [{ context: "CI Check", app_id: "15368" }],
      },
    } });
    malformedChecks.request.mockResolvedValue({ data: [{ type: "merge_queue" }] });
    const malformedResult = await malformedChecks.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(malformedResult.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("invalid required status check") }),
    ]));
  });

  it.each([
    [],
    { checks: {} },
    { checks: [null] },
    { contexts: {} },
  ])("keeps malformed classic status-check shapes unknown: %p", async (requiredStatusChecks) => {
    const value = harness();
    value.repos.getBranchProtection.mockResolvedValue({ data: {
      required_status_checks: requiredStatusChecks,
    } });
    value.request.mockResolvedValue({ data: [{ type: "merge_queue" }] });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("invalid required status check") }),
    ]));
  });

  it("records independent classic protection and merge-queue observation failures", async () => {
    const value = harness();
    value.repos.getBranchProtection.mockRejectedValue({ status: 403, message: "Protection forbidden" });
    value.graphql.mockRejectedValue({ status: 502, message: "GraphQL unavailable" });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("Protection forbidden") }),
      expect.objectContaining({ area: "classic-protection", message: expect.stringContaining("GraphQL unavailable") }),
    ]));
  });

  it("maps a classic any-source context to an exact unknown producer identity", async () => {
    const value = harness();
    value.repos.getBranchProtection.mockResolvedValue({ data: {
      required_status_checks: { strict: true, contexts: ["Legacy CI"] },
    } });
    value.request.mockResolvedValue({ data: [{ type: "merge_queue" }] });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers).toEqual([
      expect.objectContaining({ name: "Legacy CI", integrationId: "any", support: "unknown" }),
    ]);
    expect(value.apps.getBySlug).not.toHaveBeenCalled();
  });

  it("fails producer identity closed when the GitHub Actions app cannot be resolved", async () => {
    const value = harness();
    value.apps.getBySlug.mockRejectedValue(new Error("app lookup unavailable"));
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers).toEqual([
      expect.objectContaining({ support: "unknown", reason: expect.stringContaining("app lookup unavailable") }),
    ]);
  });

  it("records an unavailable workflow tree as an observation problem", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: null } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems).toEqual([
      expect.objectContaining({ area: "workflow-contract", message: expect.stringContaining("no valid .github/workflows tree") }),
    ]);
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({ support: "unknown" }));
  });

  it("bounds the number of workflow entries inspected", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: Array.from({ length: 501 }, () => workflowEntry("jobs: {}")) } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems[0].message).toContain("more than 500 workflow entries");
  });

  it("keeps malformed and oversized workflow definitions explicit instead of matching them", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: [
        workflowEntry("jobs: [", "malformed.yml"),
        { ...workflowEntry("jobs: {}", "large.yml"), object: { text: "jobs: {}", byteSize: 1_000_001, isBinary: false } },
        { name: "binary.yml", type: "blob", object: { text: "jobs: {}", byteSize: 8, isBinary: true } },
        { name: "notes.txt", type: "blob", object: { text: "ignored", byteSize: 7, isBinary: false } },
      ] } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({
      support: "unknown",
      reason: expect.stringContaining("2 workflow file(s) could not be parsed"),
    }));
  });

  it("uses a literal job id as the check name when the job has no display name", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "ci-check", integration_id: 15368 }],
      } },
    ] });
    const content = "on:\n  merge_group:\n    types: checks_requested\njobs:\n  ci-check:\n    runs-on: ubuntu-latest\n";
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: [workflowEntry(content)] } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual(expect.objectContaining({
        mergeQueueProducers: [expect.objectContaining({ name: "ci-check", support: "supported" })],
      }));
  });

  it.each([
    "on: merge_group",
    "on: [pull_request, merge_group]",
    "on:\n  merge_group:",
    "on:\n  merge_group: {}",
  ])("accepts a valid unfiltered merge_group trigger: %s", async (trigger) => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    const content = `${trigger}\njobs:\n  check:\n    name: CI Check\n    runs-on: ubuntu-latest\n`;
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: [workflowEntry(content)] } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({ support: "supported" }));
  });

  it("keeps matrix job check names unknown instead of claiming a static match", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    const content = [
      "on:",
      "  merge_group:",
      "jobs:",
      "  check:",
      "    name: CI Check",
      "    strategy:",
      "      matrix:",
      "        node: [20, 22]",
      "    runs-on: ubuntu-latest",
    ].join("\n");
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: [workflowEntry(content)] } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({
      support: "unknown",
      reason: expect.stringContaining("No exact static workflow job"),
    }));
  });

  it.each([
    ["dynamic", "    name: \"${{ github.job }}\"\n    runs-on: ubuntu-latest"],
    ["reusable", "    name: CI Check\n    uses: owner/shared/.github/workflows/ci.yml@main"],
  ])("keeps %s job names unknown", async (_kind, jobDefinition) => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: {
        required_status_checks: [{ context: "CI Check", integration_id: 15368 }],
      } },
    ] });
    const content = `on:\n  merge_group:\njobs:\n  check:\n${jobDefinition}\n`;
    value.graphql.mockImplementation((graphqlQuery: string) => graphqlQuery.includes("DeploymentWorkflowContracts")
      ? { repository: { object: { entries: [workflowEntry(content)] } } }
      : { repository: { ref: { branchProtectionRule: { requiresMergeQueue: false } } } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({ support: "unknown" }));
  });

  it("verifies an exact required workflow rule", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "workflows", parameters: { workflows: [
        { path: ".github/workflows/required.yml", repository_id: 100, ref: "master" },
      ] } },
    ] });
    value.repos.getContent.mockResolvedValue({ data: workflowContent(supportedWorkflow) });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual(expect.objectContaining({
        mergeQueueProducers: [expect.objectContaining({
          kind: "workflow",
          path: ".github/workflows/required.yml",
          support: "supported",
        })],
      }));
  });

  it.each([
    [{ encoding: "base64", size: 4, content: "***=" }, "valid bounded base64"],
    [{ encoding: "base64", content: Buffer.from("jobs: {}", "utf8").toString("base64") }, "size metadata is unavailable"],
    [{ encoding: "base64", size: 99, content: Buffer.from("jobs: {}", "utf8").toString("base64") }, "does not match"],
    [{ encoding: "base64", size: 2, content: "/+4=" }, "valid UTF-8"],
  ])("keeps invalid required-workflow content unknown: %s", async (content, reason) => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "workflows", parameters: { workflows: [
        { path: ".github/workflows/required.yml", repository_id: 100 },
      ] } },
    ] });
    value.repos.getContent.mockResolvedValue({ data: content });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({
      support: "unknown",
      reason: expect.stringContaining(reason),
    }));
  });

  it("fails closed on malformed required-workflow rule entries without inventing an identity", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "workflows", parameters: { workflows: [
        { path: ".github/workflows/missing-id.yml" },
        { path: ".github/workflows/invalid-id.yml", repository_id: -1 },
      ] } },
    ] });
    await expect(value.repository.getTargetCapabilities("owner", "repo", "master", "token"))
      .resolves.toEqual(expect.objectContaining({
        mergeQueueProducers: [],
        mergeQueueObservationProblems: [expect.objectContaining({
          area: "effective-rules",
          message: expect.stringContaining("invalid required workflow"),
        })],
      }));
  });

  it("fails closed on malformed required status-check identities", async () => {
    const value = harness();
    value.request.mockResolvedValue({ data: [
      { type: "merge_queue" },
      { type: "required_status_checks", parameters: { required_status_checks: [
        { context: "", integration_id: 15368 },
        { context: "CI Check", integration_id: -1 },
      ] } },
    ] });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueObservationProblems).toEqual([
      expect.objectContaining({ area: "effective-rules", message: expect.stringContaining("invalid required status check") }),
    ]);
  });

  it("resolves and verifies a required workflow from another repository", async () => {
    const value = harness();
    value.request.mockImplementation((route: string) => route.includes("/rules/branches/")
      ? { data: [
        { type: "merge_queue" },
        { type: "workflows", parameters: { workflows: [
          { path: ".github/workflows/required.yml", repository_id: 200, sha: "b".repeat(40) },
        ] } },
      ] }
      : { data: { full_name: "shared/policies" } });
    value.repos.getContent.mockResolvedValue({ data: workflowContent(supportedWorkflow) });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({ support: "supported" }));
    expect(value.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({
      owner: "shared", repo: "policies", ref: "b".repeat(40),
    }));
  });

  it.each([
    ["../unsafe.yml", 100, "unsafe or unsupported"],
    [".github/workflows/required.yml", 200, "repository identity is unavailable"],
  ])("leaves an uninspectable required workflow unknown", async (path, repositoryId, reason) => {
    const value = harness();
    value.request.mockImplementation((route: string) => route.includes("/rules/branches/")
      ? { data: [
        { type: "merge_queue" },
        { type: "workflows", parameters: { workflows: [{ path, repository_id: repositoryId }] } },
      ] }
      : { data: { full_name: "invalid/name/shape" } });
    const result = await value.repository.getTargetCapabilities("owner", "repo", "master", "token");
    expect(result.mergeQueueProducers[0]).toEqual(expect.objectContaining({
      support: "unknown", reason: expect.stringContaining(reason),
    }));
  });

  it.each([
    [{ node: { mergeQueueEntry: { id: "MQE_1" } } }, true],
    [{ node: { mergeQueueEntry: null } }, false],
  ])("reads merge queue membership idempotently", async (response, expected) => {
    const value = harness();
    value.graphql.mockResolvedValue(response);
    await expect(value.repository.isPullRequestQueued("owner", "repo", "PR_node", "token")).resolves.toBe(expected);
  });

  it("rejects a merge that GitHub did not perform", async () => {
    const value = harness();
    value.pulls.merge.mockResolvedValue({ data: { merged: false, message: "checks pending" } });
    await expect(value.repository.mergePullRequest("owner", "repo", 40, "token")).rejects.toThrow("checks pending");
  });

  it("returns the merge SHA after GitHub performs the merge", async () => {
    const value = harness();
    value.pulls.merge.mockResolvedValue({ data: { merged: true, sha: "c".repeat(40) } });
    await expect(value.repository.mergePullRequest("owner", "repo", 40, "token")).resolves.toBe("c".repeat(40));
  });

  it("returns an exact merge base and rejects a missing one", async () => {
    const value = harness();
    value.repos.compareCommits.mockResolvedValueOnce({ data: { merge_base_commit: { sha: "a".repeat(40) } } });
    await expect(value.repository.getMergeBaseSha("owner", "repo", "master", "release/3.4.0", "token"))
      .resolves.toBe("a".repeat(40));
    value.repos.compareCommits.mockResolvedValueOnce({ data: {} });
    await expect(value.repository.getMergeBaseSha("owner", "repo", "master", "release/3.4.0", "token"))
      .rejects.toThrow("no merge base");
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
