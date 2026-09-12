import type { DeploymentOperationSnapshot } from "../deployment_operation";
import {
  decideDeploymentStateSave,
  deploymentStateFence,
  nextDeploymentRevision,
  readDeploymentOperationState,
} from "../deployment_state_fence";

const operation = (overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  stateVersion: 1,
  revision: 7,
  operationId: "operation-12345678",
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase: "publishing",
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

const publicationReceipt = {
  tag: "v3.4.0",
  productionSha: "c".repeat(40),
  operationId: "operation-12345678",
  releaseUrl: "https://github.com/owner/repo/releases/tag/v3.4.0",
};

describe("deployment state fencing", () => {
  it("classifies absent, current, unversioned, future, and malformed states", () => {
    expect(readDeploymentOperationState(undefined)).toEqual({ kind: "absent" });
    expect(readDeploymentOperationState(operation()).kind).toBe("current");
    expect(readDeploymentOperationState({ operationId: "operation-12345678" }).kind).toBe("invalid");
    expect(readDeploymentOperationState({ ...operation(), stateVersion: 2 }).kind).toBe("unsupported");
    expect(readDeploymentOperationState({ ...operation(), revision: -1 }).kind).toBe("invalid");
  });

  it("derives the exact immutable fence", () => {
    expect(deploymentStateFence(operation())).toEqual({
      operationId: "operation-12345678",
      phase: "publishing",
      revision: 7,
    });
  });

  it("starts at revision one and never wraps", () => {
    expect(nextDeploymentRevision({ kind: "absent" })).toBe(1);
    expect(nextDeploymentRevision({
      kind: "current",
      fence: { operationId: "operation-12345678", phase: "publishing", revision: 7 },
    })).toBe(8);
    expect(nextDeploymentRevision({
      kind: "current",
      fence: { operationId: "operation-12345678", phase: "publishing", revision: Number.MAX_SAFE_INTEGER },
    })).toBeUndefined();
  });

  it("writes only the exact successor of an absent state", () => {
    expect(decideDeploymentStateSave(
      { kind: "absent" },
      { kind: "absent" },
      operation({ revision: 1 }),
    )).toEqual({ kind: "write" });
  });

  it("writes only when operation, phase, and revision match", () => {
    const current = operation();
    expect(decideDeploymentStateSave(
      { kind: "current", operation: current },
      { kind: "current", fence: deploymentStateFence(current) },
      operation({ revision: 8, phase: "published", productionSha: "c".repeat(40), publicationVerified: true, publicationReceipt }),
    )).toEqual({ kind: "write" });
  });

  it("recognizes an already-applied semantic state independent of key order", () => {
    const proposed = operation({ revision: 8, phase: "published", productionSha: "c".repeat(40), publicationVerified: true, publicationReceipt });
    const reordered = { ...proposed };
    expect(decideDeploymentStateSave(
      { kind: "current", operation: reordered },
      { kind: "current", fence: deploymentStateFence(operation()) },
      proposed,
    ).kind).toBe("already-applied");
  });

  it.each([
    ["stale", { kind: "current", operation: operation({ revision: 8 }) }],
    ["missing", { kind: "absent" }],
    ["conflict", { kind: "current", operation: operation({ operationId: "operation-conflict" }) }],
    ["invalid", { kind: "invalid", reason: "bad state" }],
    ["invalid", { kind: "unsupported", stateVersion: 2 }],
  ] as const)("returns %s without authorizing a write", (kind, actual) => {
    expect(decideDeploymentStateSave(
      actual,
      { kind: "current", fence: deploymentStateFence(operation()) },
      operation({ revision: 8, phase: "published" }),
    ).kind).toBe(kind);
  });

  it("rejects skipped, repeated, and overflowed proposed revisions", () => {
    const expected = { kind: "current", fence: deploymentStateFence(operation()) } as const;
    expect(decideDeploymentStateSave({ kind: "current", operation: operation() }, expected, operation({ revision: 7 })).kind).toBe("invalid");
    expect(decideDeploymentStateSave({ kind: "current", operation: operation() }, expected, operation({ revision: 9 })).kind).toBe("invalid");
    expect(decideDeploymentStateSave(
      { kind: "current", operation: operation({ revision: Number.MAX_SAFE_INTEGER }) },
      { kind: "current", fence: deploymentStateFence(operation({ revision: Number.MAX_SAFE_INTEGER })) },
      operation({ revision: Number.MAX_SAFE_INTEGER }),
    ).kind).toBe("invalid");
  });
});
