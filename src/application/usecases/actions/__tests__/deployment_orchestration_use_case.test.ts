import { DEFAULT_DEPLOYMENT_CONFIGURATION } from "../../../../domain/deployment_configuration";
import type { DeploymentOperationSnapshot, DeploymentPhase } from "../../../../domain/deployment_operation";
import type { Execution } from "../../../../data/model/execution";
import { DeploymentOrchestrationUseCase } from "../deployment_orchestration_use_case";
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from "../../../../domain/copilot_lifecycle";

const sourceSha = "a".repeat(40);
const originSha = "b".repeat(40);
const productionSha = "c".repeat(40);
let durableState: DeploymentOperationSnapshot | undefined;

const operation = (phase: DeploymentPhase, overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  operationId: "operation-12345678",
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase,
  strategy: "production-lineage",
  prMode: "auto",
  selectedPrMode: "auto-merge",
  backmergeMode: "auto",
  hotfixActiveReleasePolicy: "prefer-release",
  cleanup: "all",
  issueCompletion: "close",
  presentationMode: "guided",
  diagrams: true,
  commentMode: "update",
  sourceBranch: "release/3.4.0",
  sourceSha,
  originBranch: "develop",
  originSha,
  productionBranch: "master",
  developmentBranch: "develop",
  reconciliationTree: "sync",
  promotionPullRequest: 40,
  productionSha: phase === "preparing" || phase === "promotion_pr_pending" ? undefined : productionSha,
  tag: "v3.4.0",
  publicationWorkflow: "release_workflow.yml",
  publicationVerified: ["published", "reconciliation_pending", "completed"].includes(phase),
  reconciliationTargets: [],
  lastFailure: null,
  ...overrides,
});

const pr = (overrides: Record<string, unknown> = {}) => ({
  number: 40,
  nodeId: "PR_node",
  body: '<!-- copilot-deployment operation-id="operation-12345678" phase="promotion" issue="355" -->',
  headBranch: "release/3.4.0",
  headSha: sourceSha,
  baseBranch: "master",
  state: "open" as const,
  merged: false,
  mergeCommitSha: undefined,
  repositoryFullName: "owner/repo",
  ...overrides,
});

function execution(action: "prepare" | "continue" | "published" | "failed" | "deployed", current?: DeploymentOperationSnapshot): Execution {
  durableState = current;
  return {
    owner: "owner",
    repo: "repo",
    tokens: { token: "pat" },
    branches: { defaultBranch: "master", development: "develop", releaseTree: "release", hotfixTree: "hotfix" },
    workflows: { release: "release_workflow.yml", hotfix: "hotfix_workflow.yml" },
    locale: { issue: "en-US", pullRequest: "en-US" },
    labels: {
      isRelease: true,
      isHotfix: false,
      deploy: "deploy",
      deployed: "deployed",
      lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
      currentIssueLabels: ["release", "deploy"],
    },
    deployment: { ...DEFAULT_DEPLOYMENT_CONFIGURATION },
    singleAction: {
      issue: 355,
      version: "3.4.0",
      title: "Release",
      changelog: "Changes",
      operationId: "operation-12345678",
      message: "Publication failed; inspect https://github.com/owner/repo/actions/runs/1",
      isDeployedAction: action === "deployed",
      isPrepareDeploymentAction: action === "prepare",
      isContinueDeploymentAction: action === "continue",
      isPublishedDeploymentAction: action === "published",
      isFailedDeploymentAction: action === "failed",
    },
    pullRequest: { number: 40, mergeTimeout: 600 },
    currentConfiguration: {
      branchType: "release",
      releaseBranch: "release/3.4.0",
      hotfixBranch: undefined,
      releaseOriginBranch: "develop",
      releaseOriginSha: originSha,
      deploymentOrchestration: current,
    },
  } as unknown as Execution;
}

function harness() {
  const pullRequests = {
    findManagedPullRequests: jest.fn().mockResolvedValue([]),
    createManagedPullRequest: jest.fn().mockResolvedValue(pr()),
    getPullRequest: jest.fn().mockResolvedValue(pr()),
    getTargetCapabilities: jest.fn().mockResolvedValue({ autoMergeAllowed: true, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: false }),
    enableAutoMerge: jest.fn(),
    enqueuePullRequest: jest.fn(),
    mergePullRequest: jest.fn(),
  };
  const git = {
    getBranchSha: jest.fn().mockImplementation(async (_owner, _repo, branch) => {
      if (branch === "release/3.4.0") return sourceSha;
      if (branch === "master") return productionSha;
      if (String(branch).startsWith("sync/")) return "e".repeat(40);
      return "d".repeat(40);
    }),
    getMergeBaseSha: jest.fn().mockResolvedValue(originSha),
    isCommitReachable: jest.fn().mockResolvedValue(true),
    createOrVerifyBranch: jest.fn(),
    mergeCommitIntoBranch: jest.fn().mockResolvedValue("e".repeat(40)),
    deleteBranch: jest.fn(),
    listBranches: jest.fn().mockResolvedValue([]),
  };
  const continuation = { dispatch: jest.fn() };
  const legacyMerge = { waitAndMerge: jest.fn() };
  const presentation = {
    findDashboard: jest.fn().mockResolvedValue(undefined),
    createDashboard: jest.fn(),
    updateDashboard: jest.fn(),
    publishMilestone: jest.fn(),
  };
  const state = {
    load: jest.fn(async () => durableState),
    save: jest.fn(async ({ state: persisted }) => { durableState = persisted.deploymentOrchestration; }),
  };
  const labels = { getLabels: jest.fn().mockResolvedValue(["release", "deploy"]), setLabels: jest.fn() };
  const issues = { closeIssue: jest.fn().mockResolvedValue(true), addComment: jest.fn() };
  const useCase = new DeploymentOrchestrationUseCase({
    pullRequests,
    git,
    continuation,
    legacyMerge,
    presentation,
    state,
    labels,
    issues,
    operationId: () => "operation-12345678",
  });
  return { useCase, pullRequests, git, continuation, legacyMerge, presentation, state, labels, issues };
}

describe("DeploymentOrchestrationUseCase", () => {
  it("prepares a durable operation and opens exactly one promotion PR", async () => {
    const value = harness();
    const input = execution("prepare");
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(true);
    expect(value.pullRequests.createManagedPullRequest).toHaveBeenCalledTimes(1);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({ phase: "promotion_pr_pending", promotionPullRequest: 40 }));
  });

  it("snapshots the exact release origin SHA and workflow", async () => {
    const value = harness();
    const input = execution("prepare");
    await value.useCase.invoke(input);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({
      originBranch: "develop", originSha, publicationWorkflow: "release_workflow.yml",
    }));
  });

  it("persists the operation before requesting native auto-merge", async () => {
    const value = harness();
    const order: string[] = [];
    value.state.save.mockImplementation(async ({ state }) => { durableState = state.deploymentOrchestration; order.push("persist"); });
    value.pullRequests.enableAutoMerge.mockImplementation(async () => { order.push("merge"); });
    await value.useCase.invoke(execution("prepare"));
    expect(order.indexOf("persist")).toBeLessThan(order.indexOf("merge"));
  });

  it("merges immediately only after persisting identity when GitHub reports every requirement satisfied", async () => {
    const value = harness();
    value.pullRequests.getTargetCapabilities.mockResolvedValue({
      autoMergeAllowed: true,
      mergeQueueRequired: false,
      immediatelyMergeable: true,
      requiresStrictStatusChecks: false,
    });
    await value.useCase.invoke(execution("prepare"));
    expect(value.pullRequests.mergePullRequest).toHaveBeenCalledWith("owner", "repo", 40, "pat");
    expect(value.pullRequests.enableAutoMerge).not.toHaveBeenCalled();
  });

  it("uses the bounded existing-PR waiter only in legacy-wait mode", async () => {
    const value = harness();
    await value.useCase.invoke(execution("prepare", operation("preparing", { prMode: "legacy-wait" })));
    expect(value.legacyMerge.waitAndMerge).toHaveBeenCalledWith(
      "owner", "repo", "release/3.4.0", 40, "master", 600, "pat",
    );
    expect(value.pullRequests.enableAutoMerge).not.toHaveBeenCalled();
  });

  it("stops before side effects when durable state changed concurrently", async () => {
    const value = harness();
    value.state.load.mockResolvedValue(operation("completed", { operationId: "another-12345678" }));
    const result = await value.useCase.invoke(execution("prepare"));
    expect(result[0].success).toBe(false);
    expect(value.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
  });

  it("reuses a pending promotion instead of duplicating it", async () => {
    const value = harness();
    value.pullRequests.findManagedPullRequests.mockResolvedValue([pr()]);
    await value.useCase.invoke(execution("prepare", operation("promotion_pr_pending")));
    expect(value.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
  });

  it("blocks if the frozen release head changed after preparation", async () => {
    const value = harness();
    value.git.getBranchSha.mockResolvedValue("f".repeat(40));
    const input = execution("prepare", operation("promotion_pr_pending"));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("blocked");
  });

  it("does not clear an unrelated publication block when prepare mode is replayed", async () => {
    const value = harness();
    const blocked = operation("blocked", {
      lastFailure: { category: "publication", message: "npm unavailable", retryable: true, previousPhase: "publishing" },
    });
    const input = execution("prepare", blocked);
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(blocked);
  });

  it("blocks a promotion PR closed without merge and never dispatches publication", async () => {
    const value = harness();
    value.pullRequests.findManagedPullRequests.mockResolvedValue([pr({ state: "closed" })]);
    const result = await value.useCase.invoke(execution("prepare", operation("preparing")));
    expect(result[0].success).toBe(false);
    expect(value.continuation.dispatch).not.toHaveBeenCalled();
  });

  it("advances an already merged promotion discovered during a retry", async () => {
    const value = harness();
    value.pullRequests.findManagedPullRequests.mockResolvedValue([pr({ state: "closed", merged: true, mergeCommitSha: productionSha })]);
    await value.useCase.invoke(execution("prepare", operation("preparing")));
    expect(value.continuation.dispatch).toHaveBeenCalledWith("owner", "repo", "release_workflow.yml", "master", "operation-12345678", 355, "3.4.0", "pat");
  });

  it("verifies and dispatches publication for a merged promotion event", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ state: "closed", merged: true, mergeCommitSha: productionSha }));
    const input = execution("continue", operation("promotion_pr_pending"));
    await value.useCase.invoke(input);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({ phase: "publishing", productionSha }));
    expect(value.continuation.dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects a forged operation marker", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ body: '<!-- copilot-deployment operation-id="forged-12345678" phase="promotion" issue="355" -->' }));
    const result = await value.useCase.invoke(execution("continue", operation("promotion_pr_pending")));
    expect(result[0].success).toBe(false);
    expect(value.continuation.dispatch).not.toHaveBeenCalled();
  });

  it("rejects a cross-repository promotion event", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ repositoryFullName: "attacker/fork", state: "closed", merged: true, mergeCommitSha: productionSha }));
    const result = await value.useCase.invoke(execution("continue", operation("promotion_pr_pending")));
    expect(result[0].success).toBe(false);
  });

  it("rejects a merged PR whose head does not match the prepared SHA", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ headSha: "f".repeat(40), state: "closed", merged: true, mergeCommitSha: productionSha }));
    const input = execution("continue", operation("promotion_pr_pending"));
    await value.useCase.invoke(input);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("blocked");
  });

  it("ignores a duplicate promotion event after publication started", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ state: "closed", merged: true, mergeCommitSha: productionSha }));
    await value.useCase.invoke(execution("continue", operation("publishing")));
    expect(value.continuation.dispatch).not.toHaveBeenCalled();
  });

  it("projects verified publication into labels and one reconciliation PR", async () => {
    const value = harness();
    value.pullRequests.createManagedPullRequest.mockResolvedValue(pr({ number: 41, nodeId: "PR_reconcile", body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->', headBranch: "master", headSha: productionSha, baseBranch: "develop" }));
    const input = execution("published", operation("publishing"));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(true);
    expect(value.labels.setLabels).toHaveBeenCalledWith(
      "owner", "repo", 355, expect.arrayContaining(["release", "deployed", "state:in-progress"]), "pat",
    );
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({ phase: "reconciliation_pending", publicationVerified: true }));
  });

  it("delegates the compatibility deployed action when durable state exists", async () => {
    const value = harness();
    value.pullRequests.createManagedPullRequest.mockResolvedValue(pr({ number: 41, headBranch: "master", headSha: productionSha, baseBranch: "develop" }));
    const input = execution("deployed", operation("publishing"));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(true);
    expect(input.currentConfiguration.deploymentOrchestration?.publicationVerified).toBe(true);
  });

  it("does not republish or duplicate reconciliation after a duplicate notification", async () => {
    const value = harness();
    await value.useCase.invoke(execution("published", operation("reconciliation_pending", {
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, pullRequest: 41, status: "pending" }],
    })));
    expect(value.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
    expect(value.labels.setLabels).not.toHaveBeenCalled();
  });

  it("recovers a reconciliation PR after cancellation between plan persistence and PR creation", async () => {
    const value = harness();
    value.pullRequests.createManagedPullRequest.mockResolvedValue(pr({
      number: 41,
      body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->',
      headBranch: "master",
      headSha: productionSha,
      baseBranch: "develop",
    }));
    const input = execution("published", operation("reconciliation_pending", {
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, status: "pending" }],
    }));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(true);
    expect(value.pullRequests.createManagedPullRequest).toHaveBeenCalledTimes(1);
    expect(input.currentConfiguration.deploymentOrchestration?.reconciliationTargets[0].pullRequest).toBe(41);
  });

  it("fails the publication continuation when the recovered reconciliation PR was closed unmerged", async () => {
    const value = harness();
    value.pullRequests.findManagedPullRequests.mockResolvedValue([pr({
      number: 41,
      body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->',
      headBranch: "master",
      headSha: productionSha,
      baseBranch: "develop",
      state: "closed",
    })]);
    const input = execution("published", operation("reconciliation_pending", {
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, status: "pending" }],
    }));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("blocked");
  });

  it("records a publication workflow failure in durable state and the dashboard", async () => {
    const value = harness();
    const input = execution("failed", operation("publishing"));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({
      phase: "blocked",
      lastFailure: expect.objectContaining({ category: "publication", previousPhase: "publishing", retryable: true }),
    }));
    expect(value.presentation.createDashboard).toHaveBeenCalled();
  });

  it("ignores a delayed failure report after completion", async () => {
    const value = harness();
    const input = execution("failed", operation("completed"));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(true);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("completed");
    expect(value.state.save).not.toHaveBeenCalled();
  });

  it("leaves a manual deployment published and keeps its issue open", async () => {
    const value = harness();
    const result = await value.useCase.invoke(execution("published", operation("publishing", { strategy: "manual", issueCompletion: "keep-open" })));
    expect(result[0].steps.join(" ")).toContain("Manual reconciliation");
    expect(value.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
    expect(value.issues.closeIssue).not.toHaveBeenCalled();
  });

  it("prefers an active release as the hotfix reconciliation target", async () => {
    const value = harness();
    value.git.listBranches.mockResolvedValue(["release/3.5.0"]);
    value.pullRequests.createManagedPullRequest.mockResolvedValue(pr({ number: 41, body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->', headBranch: "master", headSha: productionSha, baseBranch: "release/3.5.0" }));
    const input = execution("published", operation("publishing", { kind: "hotfix", sourceBranch: "hotfix/3.4.1", publicationWorkflow: "hotfix_workflow.yml" }));
    await value.useCase.invoke(input);
    expect(input.currentConfiguration.deploymentOrchestration?.reconciliationTargets[0].targetBranch).toBe("release/3.5.0");
  });

  it("blocks a hotfix when multiple active releases are ambiguous", async () => {
    const value = harness();
    value.git.listBranches.mockResolvedValue(["release/3.5.0", "release/3.6.0"]);
    const input = execution("published", operation("publishing", { kind: "hotfix", sourceBranch: "hotfix/3.4.1" }));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("blocked");
  });

  it("creates a unique sync branch for a strict advanced target", async () => {
    const value = harness();
    value.pullRequests.getTargetCapabilities.mockResolvedValue({ autoMergeAllowed: true, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: true });
    value.git.isCommitReachable.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    value.pullRequests.createManagedPullRequest.mockResolvedValue(pr({ number: 41, body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->', headBranch: "sync/release-3.4.0-to-develop-operatio", headSha: "e".repeat(40), baseBranch: "develop" }));
    await value.useCase.invoke(execution("published", operation("publishing")));
    expect(value.git.createOrVerifyBranch).toHaveBeenCalledWith("owner", "repo", "sync/release-3.4.0-to-develop-operatio", "d".repeat(40), "pat");
    expect(value.git.mergeCommitIntoBranch).toHaveBeenCalled();
  });

  it("blocks explicit direct reconciliation instead of merging development back into production", async () => {
    const value = harness();
    value.pullRequests.getTargetCapabilities.mockResolvedValue({
      autoMergeAllowed: true,
      mergeQueueRequired: false,
      immediatelyMergeable: false,
      requiresStrictStatusChecks: true,
    });
    value.git.isCommitReachable.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const input = execution("published", operation("publishing", { backmergeMode: "direct" }));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({
      phase: "blocked",
      lastFailure: expect.objectContaining({ category: "reconciliation", retryable: false }),
    }));
    expect(value.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
  });

  it("completes reconciliation, cleanup and issue closure after the managed PR merge", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({
      number: 41,
      body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->',
      headBranch: "master",
      baseBranch: "develop",
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
    }));
    const input = execution("continue", operation("reconciliation_pending", {
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, pullRequest: 41, status: "pending" }],
    }));
    input.pullRequest = { number: 41 } as never;
    await value.useCase.invoke(input);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("completed");
    expect(value.git.deleteBranch).toHaveBeenCalledWith("owner", "repo", "release/3.4.0", "pat");
    expect(value.issues.closeIssue).toHaveBeenCalled();
  });

  it("blocks a merged reconciliation that does not contain the persisted release SHA", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({
      number: 41,
      body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->',
      headBranch: "master",
      headSha: productionSha,
      baseBranch: "develop",
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
    }));
    value.git.isCommitReachable.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const input = execution("continue", operation("reconciliation_pending", {
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, pullRequest: 41, status: "pending" }],
    }));
    input.pullRequest = { number: 41 } as never;
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(false);
    expect(value.git.deleteBranch).not.toHaveBeenCalled();
    expect(value.issues.closeIssue).not.toHaveBeenCalled();
  });

  it("retains the launcher issue when keep-open is configured", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ number: 41, body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->', headBranch: "master", baseBranch: "develop", state: "closed", merged: true, mergeCommitSha: "e".repeat(40) }));
    const input = execution("continue", operation("reconciliation_pending", {
      issueCompletion: "keep-open",
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, pullRequest: 41, status: "pending" }],
    }));
    input.pullRequest = { number: 41 } as never;
    await value.useCase.invoke(input);
    expect(value.issues.closeIssue).not.toHaveBeenCalled();
  });

  it.each([
    ["all", ["sync/release-3.4.0", "release/3.4.0"]],
    ["source-only", ["release/3.4.0"]],
    ["sync-only", ["sync/release-3.4.0"]],
    ["none", []],
  ] as const)("applies the %s cleanup policy only after reconciliation", async (cleanup, expectedBranches) => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({
      number: 41,
      body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->',
      headBranch: "sync/release-3.4.0",
      baseBranch: "develop",
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
    }));
    const input = execution("continue", operation("reconciliation_pending", {
      cleanup,
      reconciliationTargets: [{
        targetBranch: "develop",
        sourceBranch: "master",
        sourceSha: productionSha,
        syncBranch: "sync/release-3.4.0",
        pullRequest: 41,
        status: "pending",
      }],
    }));
    input.pullRequest = { number: 41 } as never;
    await value.useCase.invoke(input);
    expect(value.git.deleteBranch.mock.calls.map((call) => call[2])).toEqual(expectedBranches);
  });

  it("keeps cleanup failures retryable after every reconciliation target merged", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({
      number: 41,
      body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->',
      headBranch: "master",
      baseBranch: "develop",
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
    }));
    value.git.deleteBranch.mockRejectedValueOnce(new Error("temporary cleanup failure"));
    const input = execution("continue", operation("reconciliation_pending", {
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, pullRequest: 41, status: "pending" }],
    }));
    input.pullRequest = { number: 41 } as never;

    const failed = await value.useCase.invoke(input);
    expect(failed[0].success).toBe(false);
    expect(input.currentConfiguration.deploymentOrchestration).toEqual(expect.objectContaining({
      phase: "blocked",
      lastFailure: expect.objectContaining({ category: "cleanup", retryable: true, previousPhase: "reconciliation_pending" }),
    }));

    const retry = execution("continue", input.currentConfiguration.deploymentOrchestration);
    retry.pullRequest = { number: 41 } as never;
    const completed = await value.useCase.invoke(retry);
    expect(completed[0].success).toBe(true);
    expect(retry.currentConfiguration.deploymentOrchestration?.phase).toBe("completed");
  });

  it("retries cleanup from durable completed-target facts when publish mode is replayed", async () => {
    const value = harness();
    const input = execution("published", operation("blocked", {
      publicationVerified: true,
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: productionSha, pullRequest: 41, status: "completed" }],
      lastFailure: { category: "cleanup", message: "temporary cleanup failure", retryable: true, previousPhase: "reconciliation_pending" },
    }));
    const result = await value.useCase.invoke(input);
    expect(result[0].success).toBe(true);
    expect(input.currentConfiguration.deploymentOrchestration?.phase).toBe("completed");
    expect(value.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
    expect(value.git.deleteBranch).toHaveBeenCalledWith("owner", "repo", "release/3.4.0", "pat");
  });

  it("publishes bounded milestone identities only in milestone mode", async () => {
    const value = harness();
    value.pullRequests.getPullRequest.mockResolvedValue(pr({ state: "closed", merged: true, mergeCommitSha: productionSha }));
    await value.useCase.invoke(execution("continue", operation("promotion_pr_pending", { commentMode: "milestones" })));
    expect(value.presentation.publishMilestone).toHaveBeenCalledWith(
      "owner", "repo", 355, expect.stringContaining('name="promotion-merged"'), expect.stringContaining("Publication is starting"), "pat",
    );
  });
});
