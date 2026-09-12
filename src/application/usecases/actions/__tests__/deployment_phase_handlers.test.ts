import { ApplicationError } from "../../../errors/application_error";
import type { DeploymentOrchestrationContext } from "../../../ports/deployment_orchestration_ports";
import type {
  DeploymentOperationSnapshot,
  DeploymentPhase,
} from "../../../../domain/deployment_operation";
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from "../../../../domain/deployment_configuration";
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from "../../../../domain/copilot_lifecycle";
import { Result } from "../../../../data/model/result";
import { DeploymentOrchestrationRuntime } from "../../../services/deployment_orchestration_runtime";
import { AcceptPromotionHandler } from "../deployment_handlers/accept_promotion_handler";
import { ConfirmPublicationHandler } from "../deployment_handlers/confirm_publication_handler";
import { ContinueDeploymentHandler } from "../deployment_handlers/continue_deployment_handler";
import { PreparePromotionHandler } from "../deployment_handlers/prepare_promotion_handler";
import { ReconciliationHandler } from "../deployment_handlers/reconciliation_handler";
import { RecordFailureHandler } from "../deployment_handlers/record_failure_handler";

const sourceSha = "a".repeat(40);
const originSha = "b".repeat(40);
const productionSha = "c".repeat(40);

function operation(
  phase: DeploymentPhase,
  overrides: Partial<DeploymentOperationSnapshot> = {},
): DeploymentOperationSnapshot {
  return {
    stateVersion: 1,
    revision: 1,
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
    productionSha: ["preparing", "promotion_pr_pending"].includes(phase) ? undefined : productionSha,
    tag: "v3.4.0",
    publicationWorkflow: "release_workflow.yml",
    publicationVerified: ["published", "reconciliation_pending", "completed"].includes(phase),
    publicationReceipt: ["published", "reconciliation_pending", "completed"].includes(phase)
      ? {
          tag: "v3.4.0",
          productionSha,
          operationId: "operation-12345678",
          releaseUrl: "https://github.com/owner/repo/releases/tag/v3.4.0",
        }
      : undefined,
    reconciliationTargets: [],
    lastFailure: null,
    ...overrides,
  };
}

function context(
  action: "prepare" | "continue" | "published" | "failed",
  current?: DeploymentOperationSnapshot,
): DeploymentOrchestrationContext {
  return {
    owner: "owner",
    repo: "repo",
    tokens: { token: "token" },
    branches: {
      defaultBranch: "master",
      development: "develop",
      releaseTree: "release",
      hotfixTree: "hotfix",
    },
    workflows: { release: "release_workflow.yml", hotfix: "hotfix_workflow.yml" },
    locale: { issue: "en-US", pullRequest: "en-US" },
    labels: {
      isRelease: true,
      isHotfix: false,
      deploy: "deploy",
      deployed: "deployed",
      lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
    },
    deployment: { ...DEFAULT_DEPLOYMENT_CONFIGURATION },
    singleAction: {
      issue: 355,
      version: "3.4.0",
      title: "Release",
      changelog: "Changes",
      operationId: "operation-12345678",
      message: "",
      isPrepareDeploymentAction: action === "prepare",
      isContinueDeploymentAction: action === "continue",
      isPublishedDeploymentAction: action === "published",
      isFailedDeploymentAction: action === "failed",
    },
    pullRequest: { number: 40 },
    currentConfiguration: {
      branchType: "release",
      releaseBranch: "release/3.4.0",
      releaseOriginBranch: "develop",
      releaseOriginSha: originSha,
      deploymentOrchestration: current,
    },
  };
}

const managedPullRequest = (overrides: Record<string, unknown> = {}) => ({
  number: 40,
  nodeId: "PR_node",
  body: '<!-- copilot-deployment operation-id="operation-12345678" phase="promotion" issue="355" -->',
  headBranch: "release/3.4.0",
  headSha: sourceSha,
  baseBranch: "master",
  state: "closed" as const,
  merged: true,
  autoMergeEnabled: false,
  mergeCommitSha: productionSha,
  repositoryFullName: "owner/repo",
  ...overrides,
});

function runtimeHarness() {
  const dependencies = {
    operationId: jest.fn().mockReturnValue("operation-12345678"),
    git: {
      getBranchSha: jest.fn().mockResolvedValue(sourceSha),
      getMergeBaseSha: jest.fn().mockResolvedValue(originSha),
      isCommitReachable: jest.fn().mockResolvedValue(true),
      createOrVerifyBranch: jest.fn(),
      mergeCommitIntoBranch: jest.fn(),
      deleteBranch: jest.fn(),
      listBranches: jest.fn().mockResolvedValue([]),
    },
    pullRequests: {
      findManagedPullRequests: jest.fn().mockResolvedValue([]),
      createManagedPullRequest: jest.fn().mockResolvedValue(managedPullRequest({ state: "open", merged: false })),
      getPullRequest: jest.fn().mockResolvedValue(managedPullRequest()),
      enableAutoMerge: jest.fn(),
      isPullRequestQueued: jest.fn().mockResolvedValue(false),
      enqueuePullRequest: jest.fn(),
      mergePullRequest: jest.fn(),
    },
    targetRules: { getTargetCapabilities: jest.fn() },
    continuation: { dispatch: jest.fn() },
    presentation: {
      findDashboard: jest.fn(),
      createDashboard: jest.fn(),
      updateDashboard: jest.fn(),
      publishMilestone: jest.fn(),
    },
    publication: {
      inspect: jest.fn().mockResolvedValue({
        kind: "verified",
        receipt: {
          tag: "v3.4.0",
          productionSha,
          operationId: "operation-12345678",
          releaseUrl: "https://github.com/owner/repo/releases/tag/v3.4.0",
        },
      }),
    },
    issues: { closeIssue: jest.fn(), addComment: jest.fn() },
  };
  const blockedResult = new Result({ id: "test", success: false, executed: true });
  const runtime = {
    dependencies,
    persist: jest.fn(async (value: DeploymentOrchestrationContext, state: DeploymentOperationSnapshot) => {
      value.currentConfiguration.deploymentOrchestration = state;
    }),
    block: jest.fn().mockResolvedValue(blockedResult),
    publishDashboard: jest.fn(),
    publishMilestone: jest.fn(),
    createOrReusePullRequest: jest.fn().mockResolvedValue(managedPullRequest({ state: "open", merged: false })),
    configureMergeBehavior: jest.fn().mockResolvedValue({
      kind: "configured",
      operation: operation("promotion_pr_pending"),
    }),
    inspectMergeBehavior: jest.fn().mockResolvedValue({
      kind: "ready",
      capabilities: { requiresStrictStatusChecks: false },
      decision: { kind: "mode", mode: "auto-merge" },
    }),
    cleanup: jest.fn(),
  } as unknown as DeploymentOrchestrationRuntime;
  return { runtime, dependencies, blockedResult };
}

describe("deployment phase handlers", () => {
  it.each([
    [operation("blocked"), managedPullRequest(), "out-of-order"],
    [operation("preparing"), managedPullRequest({ mergeCommitSha: undefined }), "missing-sha"],
  ])("keeps promotion %s safe for %s", async (current, pullRequest) => {
    const { runtime } = runtimeHarness();
    const result = await new AcceptPromotionHandler(runtime).invoke(context("continue", current), current, pullRequest);
    expect(result.executed).toBe(true);
  });

  it.each([
    { headBranch: "another" },
    { baseBranch: "another" },
    { headSha: "f".repeat(40) },
  ])("blocks each independent promotion identity mismatch: %p", async (override) => {
    const { runtime } = runtimeHarness();
    const current = operation("promotion_pr_pending");
    await new AcceptPromotionHandler(runtime).invoke(
      context("continue", current),
      current,
      managedPullRequest(override),
    );
    expect(runtime.block).toHaveBeenCalled();
  });

  it("blocks promotion when either accepted commit is not reachable", async () => {
    const { runtime, dependencies } = runtimeHarness();
    dependencies.git.isCommitReachable.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const current = operation("promotion_pr_pending");
    await new AcceptPromotionHandler(runtime).invoke(context("continue", current), current, managedPullRequest());
    expect(runtime.block).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), "promotion", expect.stringContaining("does not confirm"), true,
    );
  });

  it("handles duplicate completed publication without inspecting effects", async () => {
    const { runtime, dependencies } = runtimeHarness();
    const reconciliation = { plan: jest.fn() } as unknown as ReconciliationHandler;
    await new ConfirmPublicationHandler(runtime, reconciliation).invoke(context("published", operation("completed")));
    expect(runtime.publishDashboard).toHaveBeenCalled();
    expect(dependencies.publication.inspect).not.toHaveBeenCalled();
  });

  it("recovers already verified reconciliation state", async () => {
    const { runtime } = runtimeHarness();
    const reconciliation = { plan: jest.fn().mockResolvedValue(undefined) } as unknown as ReconciliationHandler;
    const result = await new ConfirmPublicationHandler(runtime, reconciliation)
      .invoke(context("published", operation("reconciliation_pending")));
    expect(result.success).toBe(true);
    expect(reconciliation.plan).toHaveBeenCalled();
  });

  it("blocks publication when the accepted production SHA is no longer reachable", async () => {
    const { runtime, dependencies } = runtimeHarness();
    dependencies.git.isCommitReachable.mockResolvedValue(false);
    const reconciliation = { plan: jest.fn() } as unknown as ReconciliationHandler;
    await new ConfirmPublicationHandler(runtime, reconciliation).invoke(context("published", operation("publishing")));
    expect(runtime.block).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), "publication", expect.stringContaining("not reachable"), false,
    );
  });

  it.each([
    operation("preparing"),
    operation("promoted", { productionSha: undefined }),
  ])("rejects incomplete publication state: %s", async (current) => {
    const { runtime } = runtimeHarness();
    const reconciliation = { plan: jest.fn() } as unknown as ReconciliationHandler;
    await expect(new ConfirmPublicationHandler(runtime, reconciliation).invoke(context("published", current)))
      .rejects.toBeInstanceOf(ApplicationError);
  });

  it("rejects a continuation without a pull request number", async () => {
    const { runtime } = runtimeHarness();
    const value = context("continue", operation("promotion_pr_pending"));
    (value.pullRequest as { number: number }).number = 0;
    const accept = new AcceptPromotionHandler(runtime);
    const reconciliation = new ReconciliationHandler(runtime);
    await expect(new ContinueDeploymentHandler(runtime, accept, reconciliation).invoke(value))
      .rejects.toBeInstanceOf(ApplicationError);
  });

  it("no-ops an open managed pull request", async () => {
    const { runtime, dependencies } = runtimeHarness();
    dependencies.pullRequests.getPullRequest.mockResolvedValue(managedPullRequest({ state: "open", merged: false }));
    const current = operation("promotion_pr_pending");
    const result = await new ContinueDeploymentHandler(
      runtime,
      new AcceptPromotionHandler(runtime),
      new ReconciliationHandler(runtime),
    ).invoke(context("continue", current));
    expect(result.success).toBe(true);
  });

  it.each(["promotion", "reconciliation"] as const)(
    "blocks an unmerged %s continuation with its exact category",
    async (phase) => {
      const { runtime, dependencies } = runtimeHarness();
      dependencies.pullRequests.getPullRequest.mockResolvedValue(managedPullRequest({
        body: `<!-- copilot-deployment operation-id="operation-12345678" phase="${phase}" issue="355" -->`,
        merged: false,
      }));
      const current = operation(phase === "promotion" ? "promotion_pr_pending" : "reconciliation_pending");
      await new ContinueDeploymentHandler(
        runtime,
        new AcceptPromotionHandler(runtime),
        new ReconciliationHandler(runtime),
      ).invoke(context("continue", current));
      expect(runtime.block).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), phase, expect.stringContaining("closed without merge"), true,
      );
    },
  );

  it("preserves a non-retryable blocked continuation", async () => {
    const { runtime } = runtimeHarness();
    const current = operation("blocked", {
      lastFailure: {
        category: "promotion",
        message: "terminal",
        retryable: false,
        previousPhase: "promotion_pr_pending",
      },
    });
    const result = await new ContinueDeploymentHandler(
      runtime,
      new AcceptPromotionHandler(runtime),
      new ReconciliationHandler(runtime),
    ).invoke(context("continue", current));
    expect(result.success).toBe(true);
    expect(runtime.publishDashboard).toHaveBeenCalled();
  });

  it.each([
    ["promotion", "preparing"],
    ["promotion", "promotion_pr_pending"],
    ["reconciliation", "reconciliation_pending"],
  ] as const)("resumes a retryable %s event from %s", async (phase, previousPhase) => {
    const { runtime, dependencies } = runtimeHarness();
    dependencies.pullRequests.getPullRequest.mockResolvedValue(managedPullRequest({
      body: `<!-- copilot-deployment operation-id="operation-12345678" phase="${phase}" issue="355" -->`,
      state: "open",
      merged: false,
    }));
    const current = operation("blocked", {
      lastFailure: { category: phase, message: "retry", retryable: true, previousPhase },
    });
    await new ContinueDeploymentHandler(
      runtime,
      new AcceptPromotionHandler(runtime),
      new ReconciliationHandler(runtime),
    ).invoke(context("continue", current));
    expect(runtime.persist).toHaveBeenCalled();
  });

  it.each([
    [operation("completed"), managedPullRequest()],
    [operation("publishing"), managedPullRequest()],
    [operation("reconciliation_pending"), managedPullRequest()],
    [operation("reconciliation_pending", { reconciliationTargets: [] }), managedPullRequest({ baseBranch: "other" })],
  ])("handles a reconciliation boundary without unsafe mutation", async (current, pullRequest) => {
    const { runtime } = runtimeHarness();
    const handler = new ReconciliationHandler(runtime);
    const result = await handler.accept(context("continue", current), current, pullRequest);
    expect(result.executed).toBe(true);
  });

  it("blocks a reconciliation merge that is not reachable", async () => {
    const { runtime, dependencies } = runtimeHarness();
    dependencies.git.isCommitReachable.mockResolvedValue(false);
    const target = {
      targetBranch: "develop",
      sourceBranch: "master",
      sourceSha: productionSha,
      pullRequest: 40,
      status: "pending" as const,
    };
    const current = operation("reconciliation_pending", { reconciliationTargets: [target] });
    await new ReconciliationHandler(runtime).accept(
      context("continue", current),
      current,
      managedPullRequest({ headBranch: "master", baseBranch: "develop" }),
    );
    expect(runtime.block).toHaveBeenCalled();
  });

  it.each([
    { headBranch: "wrong", baseBranch: "develop" },
    { headBranch: "master", baseBranch: "wrong" },
  ])("blocks a reconciliation PR identity mismatch: %p", async (override) => {
    const { runtime } = runtimeHarness();
    const target = {
      targetBranch: "develop",
      sourceBranch: "master",
      sourceSha: productionSha,
      pullRequest: 40,
      status: "pending" as const,
    };
    const current = operation("reconciliation_pending", { reconciliationTargets: [target] });
    await new ReconciliationHandler(runtime).accept(
      context("continue", current),
      current,
      managedPullRequest(override),
    );
    expect(runtime.block).toHaveBeenCalled();
  });

  it("plans the next target after accepting one reconciliation PR", async () => {
    const { runtime } = runtimeHarness();
    const targets = [
      {
        targetBranch: "develop",
        sourceBranch: "master",
        sourceSha: productionSha,
        pullRequest: 40,
        status: "pending" as const,
      },
      {
        targetBranch: "release/next",
        sourceBranch: "master",
        sourceSha: productionSha,
        pullRequest: 41,
        status: "pending" as const,
      },
    ];
    const current = operation("reconciliation_pending", { reconciliationTargets: targets });
    const result = await new ReconciliationHandler(runtime).accept(
      context("continue", current),
      current,
      managedPullRequest({ headBranch: "master", baseBranch: "develop" }),
    );
    expect(result.success).toBe(true);
    expect(runtime.publishDashboard).toHaveBeenCalled();
  });

  it("presents reconciliation state when no target can be planned", async () => {
    const { runtime } = runtimeHarness();
    const current = operation("reconciliation_pending");
    await expect(new ReconciliationHandler(runtime).plan(context("published", current), current))
      .resolves.toBeUndefined();
    expect(runtime.publishDashboard).toHaveBeenCalled();
  });

  it("blocks an unverifiable sync-branch pull request head", async () => {
    const { runtime, dependencies } = runtimeHarness();
    dependencies.git.getBranchSha.mockResolvedValue("e".repeat(40));
    dependencies.git.isCommitReachable.mockResolvedValue(false);
    runtime.createOrReusePullRequest = jest.fn().mockResolvedValue(managedPullRequest({
      number: 41,
      headBranch: "sync/release",
      headSha: "f".repeat(40),
      baseBranch: "develop",
      state: "open",
      merged: false,
    }));
    const target = {
      targetBranch: "develop",
      sourceBranch: "master",
      sourceSha: productionSha,
      syncBranch: "sync/release",
      status: "pending" as const,
    };
    const current = operation("reconciliation_pending", { reconciliationTargets: [target] });
    await new ReconciliationHandler(runtime).plan(context("published", current), current);
    expect(runtime.block).toHaveBeenCalled();
  });

  it("blocks a direct reconciliation PR whose source head moved", async () => {
    const { runtime } = runtimeHarness();
    runtime.createOrReusePullRequest = jest.fn().mockResolvedValue(managedPullRequest({
      number: 41,
      headBranch: "master",
      headSha: "f".repeat(40),
      baseBranch: "develop",
      state: "open",
      merged: false,
    }));
    const current = operation("reconciliation_pending", {
      reconciliationTargets: [{
        targetBranch: "develop",
        sourceBranch: "master",
        sourceSha: productionSha,
        status: "pending",
      }],
    });
    await new ReconciliationHandler(runtime).plan(context("published", current), current);
    expect(runtime.block).toHaveBeenCalled();
  });

  it("returns the configured block while planning reconciliation", async () => {
    const { runtime, blockedResult } = runtimeHarness();
    runtime.configureMergeBehavior = jest.fn().mockResolvedValue({ kind: "blocked", result: blockedResult });
    runtime.createOrReusePullRequest = jest.fn().mockResolvedValue(managedPullRequest({
      number: 41,
      headBranch: "master",
      headSha: productionSha,
      baseBranch: "develop",
      state: "open",
      merged: false,
    }));
    const current = operation("reconciliation_pending", {
      reconciliationTargets: [{
        targetBranch: "develop",
        sourceBranch: "master",
        sourceSha: productionSha,
        status: "pending",
      }],
    });
    await expect(new ReconciliationHandler(runtime).plan(context("published", current), current))
      .resolves.toBe(blockedResult);
  });

  it.each([
    ["completed", undefined],
    ["blocked", undefined],
    ["preparing", "promotion"],
    ["promoted", "publication"],
    ["published", "reconciliation"],
  ] as const)("records or preserves failure state for %s", async (phase, category) => {
    const { runtime } = runtimeHarness();
    const current = phase === "blocked"
      ? operation("blocked", {
          lastFailure: { category: "cleanup", message: "blocked", retryable: false, previousPhase: "reconciliation_pending" },
        })
      : operation(phase);
    const result = await new RecordFailureHandler(runtime).invoke(context("failed", current));
    expect(result.executed).toBe(true);
    if (category) expect(runtime.block).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), category, expect.any(String), true,
    );
  });

  it("rejects prepare replay for another version", async () => {
    const { runtime } = runtimeHarness();
    const current = operation("preparing", { version: "9.9.9" });
    await expect(new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime))
      .invoke(context("prepare", current))).rejects.toBeInstanceOf(ApplicationError);
  });

  it("resumes a retryable preparation block", async () => {
    const { runtime } = runtimeHarness();
    const current = operation("blocked", {
      lastFailure: {
        category: "promotion",
        message: "retry",
        retryable: true,
        previousPhase: "preparing",
      },
    });
    const result = await new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime))
      .invoke(context("prepare", current));
    expect(result.executed).toBe(true);
    expect(runtime.persist).toHaveBeenCalled();
  });

  it("reuses a deployment that has already moved beyond preparation", async () => {
    const { runtime } = runtimeHarness();
    const current = operation("publishing");
    const result = await new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime))
      .invoke(context("prepare", current));
    expect(result.success).toBe(true);
    expect(runtime.publishDashboard).toHaveBeenCalled();
  });

  it("persists hotfix origin metadata without a release compatibility branch", async () => {
    const { runtime } = runtimeHarness();
    const value = context("prepare");
    (value.labels as { isRelease: boolean; isHotfix: boolean }).isRelease = false;
    (value.labels as { isRelease: boolean; isHotfix: boolean }).isHotfix = true;
    value.currentConfiguration.branchType = "hotfix";
    value.currentConfiguration.releaseBranch = undefined;
    value.currentConfiguration.hotfixBranch = "hotfix/3.4.1";
    value.currentConfiguration.parentBranch = "master";
    value.currentConfiguration.releaseOriginSha = undefined;
    await new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime)).invoke(value);
    expect(value.currentConfiguration.hotfixOriginSha).toBe(originSha);
  });

  it("rejects an invalid new deployment snapshot before persisting it", async () => {
    const { runtime } = runtimeHarness();
    const value = context("prepare");
    (value.singleAction as { version: string }).version = "";
    await expect(new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime)).invoke(value))
      .rejects.toBeInstanceOf(ApplicationError);
    expect(runtime.persist).not.toHaveBeenCalled();
  });

  it("rejects prepare without exactly one deployment kind", async () => {
    const { runtime } = runtimeHarness();
    const value = context("prepare");
    (value.labels as { isHotfix: boolean }).isHotfix = true;
    await expect(new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime)).invoke(value))
      .rejects.toBeInstanceOf(ApplicationError);
  });

  it("rejects prepare when its source branch is absent", async () => {
    const { runtime } = runtimeHarness();
    const value = context("prepare");
    value.currentConfiguration.releaseBranch = undefined;
    await expect(new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime)).invoke(value))
      .rejects.toBeInstanceOf(ApplicationError);
  });

  it.each([
    managedPullRequest({ state: "closed", merged: false }),
    managedPullRequest({ state: "open", merged: false, headSha: "f".repeat(40) }),
  ])("blocks unsafe promotion preparation provider state", async (pullRequest) => {
    const { runtime } = runtimeHarness();
    runtime.createOrReusePullRequest = jest.fn().mockResolvedValue(pullRequest);
    const current = operation("preparing");
    await new PreparePromotionHandler(runtime, new AcceptPromotionHandler(runtime))
      .invoke(context("prepare", current));
    expect(runtime.block).toHaveBeenCalled();
  });
});
