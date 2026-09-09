import { DEFAULT_DEPLOYMENT_CONFIGURATION } from "../../../domain/deployment_configuration";
import type { DeploymentOperationSnapshot } from "../../../domain/deployment_operation";
import {
  buildInitialDeploymentOperation,
  buildReconciliationBranchName,
  buildReconciliationTarget,
  reconciliationSource,
  selectBackmergeMode,
  selectPullRequestMode,
  selectReconciliationTargetBranches,
  validateInitialDeploymentInput,
} from "../deployment_plan_policy";

const sha = (letter: string) => letter.repeat(40);
const operation = (overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  operationId: "operation-12345678",
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase: "published",
  strategy: "production-lineage",
  prMode: "auto",
  backmergeMode: "auto",
  hotfixActiveReleasePolicy: "prefer-release",
  cleanup: "all",
  issueCompletion: "close",
  presentationMode: "guided",
  diagrams: true,
  commentMode: "update",
  sourceBranch: "release/3.4.0",
  sourceSha: sha("a"),
  originBranch: "develop",
  originSha: sha("b"),
  productionBranch: "master",
  developmentBranch: "develop",
  reconciliationTree: "sync",
  tag: "v3.4.0",
  publicationWorkflow: "release_workflow.yml",
  productionSha: sha("c"),
  publicationVerified: true,
  reconciliationTargets: [],
  lastFailure: null,
  ...overrides,
});

describe("deployment plan policy", () => {
  it("snapshots a release plan from the development cut", () => {
    const value = buildInitialDeploymentOperation({
      operationId: "operation-12345678",
      kind: "release",
      version: "3.4.0",
      title: "Release",
      changelog: "Changes",
      sourceBranch: "release/3.4.0",
      sourceSha: sha("a"),
      originBranch: "develop",
      originSha: sha("b"),
      productionBranch: "master",
      developmentBranch: "develop",
      configuration: { ...DEFAULT_DEPLOYMENT_CONFIGURATION },
      publicationWorkflow: "release_workflow.yml",
    });
    expect(value).toEqual(expect.objectContaining({ phase: "preparing", originBranch: "develop", originSha: sha("b"), tag: "v3.4.0" }));
  });

  it("selects the hotfix strategy independently", () => {
    const value = buildInitialDeploymentOperation({
      operationId: "operation-12345678", kind: "hotfix", version: "3.4.1", title: "Hotfix", changelog: "Fix",
      sourceBranch: "hotfix/3.4.1", sourceSha: sha("a"), originBranch: "v3.4.0", originSha: sha("b"),
      productionBranch: "master", developmentBranch: "develop", publicationWorkflow: "hotfix_workflow.yml",
      configuration: { ...DEFAULT_DEPLOYMENT_CONFIGURATION, hotfixReconciliationStrategy: "canonical-gitflow" },
    });
    expect(value.strategy).toBe("canonical-gitflow");
  });

  it("selects merge queue when required by the target", () => {
    expect(selectPullRequestMode("auto", { autoMergeAllowed: true, mergeQueueRequired: true, immediatelyMergeable: false, requiresStrictStatusChecks: true }))
      .toEqual(expect.objectContaining({ kind: "mode", mode: "merge-queue" }));
  });

  it("selects native auto-merge while checks are pending", () => {
    expect(selectPullRequestMode("auto", { autoMergeAllowed: true, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: true }))
      .toEqual(expect.objectContaining({ kind: "mode", mode: "auto-merge" }));
  });

  it("falls back to create-only when auto-merge is unavailable", () => {
    expect(selectPullRequestMode("auto", { autoMergeAllowed: false, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: false }))
      .toEqual(expect.objectContaining({ kind: "mode", mode: "create-only" }));
  });

  it("rejects explicit auto-merge when the repository disables it", () => {
    expect(selectPullRequestMode("auto-merge", { autoMergeAllowed: false, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: false }).kind)
      .toBe("unsupported");
  });

  it("rejects explicit queue mode on a target without a required queue", () => {
    expect(selectPullRequestMode("merge-queue", { autoMergeAllowed: true, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: false }).kind)
      .toBe("unsupported");
  });

  it.each(["create-only", "legacy-wait"] as const)("preserves explicit %s mode", (mode) => {
    expect(selectPullRequestMode(mode, { autoMergeAllowed: false, mergeQueueRequired: false, immediatelyMergeable: false, requiresStrictStatusChecks: false }))
      .toEqual(expect.objectContaining({ kind: "mode", mode }));
  });

  it("uses a sync branch for a strict target whose source is stale", () => {
    expect(selectBackmergeMode("auto", true, false)).toEqual(expect.objectContaining({ kind: "mode", mode: "sync-branch" }));
  });

  it("allows a direct back-merge for a compatible target", () => {
    expect(selectBackmergeMode("auto", false, false)).toEqual(expect.objectContaining({ kind: "mode", mode: "direct" }));
  });

  it("rejects explicit direct back-merge when strict checks would require a reverse merge", () => {
    expect(selectBackmergeMode("direct", true, false)).toEqual(expect.objectContaining({ kind: "unsupported" }));
  });

  it("uses an isolated sync branch when the mutable reconciliation source advanced", () => {
    expect(selectBackmergeMode("auto", false, true, false))
      .toEqual(expect.objectContaining({ kind: "mode", mode: "sync-branch" }));
  });

  it("rejects an explicit direct reconciliation whose source no longer matches its stored SHA", () => {
    expect(selectBackmergeMode("direct", false, true, false))
      .toEqual(expect.objectContaining({ kind: "unsupported" }));
  });

  it("isolates reconciliation when the mutable source branch advanced past the stored SHA", () => {
    expect(selectBackmergeMode("auto", false, true, false)).toEqual(expect.objectContaining({ kind: "mode", mode: "sync-branch" }));
  });

  it("rejects an explicitly direct reconciliation from an advanced source branch", () => {
    expect(selectBackmergeMode("direct", false, true, false)).toEqual(expect.objectContaining({ kind: "unsupported" }));
  });

  it("reconciles every release into development", () => {
    expect(selectReconciliationTargetBranches(operation(), [])).toEqual({ kind: "targets", targetBranches: ["develop"] });
  });

  it("leaves manual releases published without targets", () => {
    expect(selectReconciliationTargetBranches(operation({ strategy: "manual" }), [])).toEqual({ kind: "manual" });
  });

  it("prefers the single active release for a hotfix", () => {
    expect(selectReconciliationTargetBranches(operation({ kind: "hotfix" }), ["release/3.5.0"]))
      .toEqual({ kind: "targets", targetBranches: ["release/3.5.0"] });
  });

  it("blocks ambiguous active releases", () => {
    expect(selectReconciliationTargetBranches(operation({ kind: "hotfix" }), ["release/3.5.0", "release/3.6.0"]).kind).toBe("blocked");
  });

  it("targets both active release and development in order", () => {
    expect(selectReconciliationTargetBranches(operation({ kind: "hotfix", hotfixActiveReleasePolicy: "both" }), ["release/3.5.0"]))
      .toEqual({ kind: "targets", targetBranches: ["release/3.5.0", "develop"] });
  });

  it("uses production ancestry for the default reconciliation source", () => {
    expect(reconciliationSource(operation())).toEqual({ branch: "master", sha: sha("c") });
  });

  it("uses the frozen source for canonical Gitflow", () => {
    expect(reconciliationSource(operation({ strategy: "canonical-gitflow" }))).toEqual({ branch: "release/3.4.0", sha: sha("a") });
  });

  it("creates deterministic collision-resistant sync branch names", () => {
    expect(buildReconciliationBranchName(operation(), "team/develop"))
      .toBe("sync/release-3.4.0-to-team-develop-operatio");
  });

  it("builds a target from the configured ancestry source", () => {
    expect(buildReconciliationTarget(operation(), "develop", "sync-branch"))
      .toEqual(expect.objectContaining({ sourceBranch: "master", targetBranch: "develop", syncBranch: expect.stringMatching(/^sync\//) }));
  });

  it("rejects invalid initial deployment facts", () => {
    const input = {
      operationId: "operation-12345678", kind: "release" as const, version: "v3", title: "", changelog: "",
      sourceBranch: "master", sourceSha: "bad", originBranch: "develop", originSha: "bad",
      productionBranch: "master", developmentBranch: "develop", publicationWorkflow: "release_workflow.yml",
      configuration: { ...DEFAULT_DEPLOYMENT_CONFIGURATION },
    };
    expect(validateInitialDeploymentInput(input)).toHaveLength(4);
  });
});
