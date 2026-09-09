import type { DeploymentOperationSnapshot, DeploymentPhase } from "../deployment_operation";
import {
  blockDeploymentOperation,
  completeReconciliationTarget,
  isDeploymentOperationSnapshot,
  resumeBlockedDeployment,
  sanitizeDeploymentMessage,
  transitionDeploymentOperation,
} from "../deployment_operation";

const operation = (phase: DeploymentPhase = "preparing", overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  operationId: "operation-12345678",
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase,
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
  sourceSha: "a".repeat(40),
  originBranch: "develop",
  originSha: "b".repeat(40),
  productionBranch: "master",
  developmentBranch: "develop",
  reconciliationTree: "sync",
  tag: "v3.4.0",
  publicationWorkflow: "release_workflow.yml",
  publicationVerified: false,
  reconciliationTargets: [],
  lastFailure: null,
  ...overrides,
});

describe("deployment operation state machine", () => {
  it.each([
    ["preparing", "promotion_pr_pending"],
    ["promotion_pr_pending", "promoted"],
    ["promoted", "publishing"],
    ["publishing", "published"],
    ["published", "reconciliation_pending"],
    ["published", "completed"],
    ["reconciliation_pending", "completed"],
  ] as const)("advances %s to %s", (from, to) => {
    const decision = transitionDeploymentOperation(operation(from), from, to);
    expect(decision.kind).toBe("advance");
    expect(decision.operation.phase).toBe(to);
  });

  it("turns a duplicate target transition into a no-op", () => {
    expect(transitionDeploymentOperation(operation("published"), "publishing", "published").kind).toBe("noop");
  });

  it("turns a stale expected phase into a no-op", () => {
    expect(transitionDeploymentOperation(operation("publishing"), "promoted", "publishing").kind).toBe("noop");
  });

  it("rejects a non-monotonic transition", () => {
    expect(transitionDeploymentOperation(operation("published"), "published", "promoted").kind).toBe("invalid");
  });

  it("permits blocking a non-terminal state", () => {
    expect(transitionDeploymentOperation(operation("publishing"), "publishing", "blocked").operation.phase).toBe("blocked");
  });

  it("records the exact safe phase when blocking", () => {
    const blocked = blockDeploymentOperation(operation("publishing"), "publication", "registry unavailable", true);
    expect(blocked.lastFailure).toEqual({ category: "publication", message: "registry unavailable", retryable: true, previousPhase: "publishing" });
  });

  it("does not overwrite the first safe phase when blocking twice", () => {
    const once = blockDeploymentOperation(operation("published"), "reconciliation", "first", true);
    expect(blockDeploymentOperation(once, "reconciliation", "second", true).lastFailure?.previousPhase).toBe("published");
  });

  it("never reopens a completed operation through block", () => {
    const complete = operation("completed");
    expect(blockDeploymentOperation(complete, "cleanup", "late", true)).toBe(complete);
  });

  it("resumes a retryable blocked operation", () => {
    const blocked = blockDeploymentOperation(operation("promoted"), "publication", "temporary", true);
    expect(resumeBlockedDeployment(blocked)).toEqual(expect.objectContaining({ kind: "advance", operation: expect.objectContaining({ phase: "promoted", lastFailure: null }) }));
  });

  it("rejects resuming a non-retryable block", () => {
    const blocked = blockDeploymentOperation(operation("promoted"), "publication", "conflict", false);
    expect(resumeBlockedDeployment(blocked).kind).toBe("invalid");
  });

  it("rejects resuming a normal state", () => {
    expect(resumeBlockedDeployment(operation("published")).kind).toBe("invalid");
  });

  it("completes only the matching reconciliation target", () => {
    const value = operation("reconciliation_pending", { reconciliationTargets: [
      { targetBranch: "release/next", sourceBranch: "master", sourceSha: "c".repeat(40), pullRequest: 10, status: "pending" },
      { targetBranch: "develop", sourceBranch: "master", sourceSha: "c".repeat(40), pullRequest: 11, status: "pending" },
    ] });
    const updated = completeReconciliationTarget(value, 10);
    expect(updated.phase).toBe("reconciliation_pending");
    expect(updated.reconciliationTargets.map(({ status }) => status)).toEqual(["completed", "pending"]);
  });

  it("keeps the operation reconciling after its final target until cleanup succeeds", () => {
    const value = operation("reconciliation_pending", { reconciliationTargets: [
      { targetBranch: "develop", sourceBranch: "master", sourceSha: "c".repeat(40), pullRequest: 11, status: "pending" },
    ] });
    const updated = completeReconciliationTarget(value, 11);
    expect(updated.phase).toBe("reconciliation_pending");
    expect(updated.reconciliationTargets[0].status).toBe("completed");
  });

  it("sanitizes workflow commands, mentions, markers, and excessive errors", () => {
    const value = sanitizeDeploymentMessage(`::error:: @team <!-- unsafe --> ${"x".repeat(3000)}`);
    expect(value).not.toContain("::");
    expect(value).not.toContain("@team");
    expect(value).not.toContain("<!--");
    expect(value).toHaveLength(2000);
  });

  it("recognizes a complete provider-neutral snapshot", () => {
    expect(isDeploymentOperationSnapshot(operation())).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { ...operation(), operationId: 123 },
    { ...operation(), phase: "unknown" },
    { ...operation(), publicationWorkflow: undefined },
    { ...operation(), reconciliationTargets: {} },
  ])("rejects malformed persisted operation %#", (value) => {
    expect(isDeploymentOperationSnapshot(value)).toBe(false);
  });
});
