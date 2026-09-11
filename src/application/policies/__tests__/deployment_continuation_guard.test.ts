import { validateDeploymentContinuation } from "../deployment_continuation_guard";
import type { DeploymentOperationSnapshot } from "../../../domain/deployment_operation";

const operation = {
  operationId: "operation-12345678",
  version: "3.4.0",
  phase: "publishing",
} as DeploymentOperationSnapshot;

describe("validateDeploymentContinuation", () => {
  it("allows standalone publication actions when no orchestration operation exists", () => {
    expect(validateDeploymentContinuation(undefined, "", ["publishing"], "")).toBeUndefined();
  });

  it("accepts the matching operation only in an allowed phase", () => {
    expect(validateDeploymentContinuation(operation, operation.operationId, ["publishing"], "3.4.0")).toBeUndefined();
  });

  it.each([
    ["", "is required"],
    ["forged-operation", "mismatch"],
  ])("rejects an untrusted operation identity %#", (operationId, message) => {
    expect(validateDeploymentContinuation(operation, operationId, ["publishing"], "3.4.0")).toContain(message);
  });

  it("rejects a matching but out-of-order continuation", () => {
    expect(validateDeploymentContinuation({ ...operation, phase: "promotion_pr_pending" }, operation.operationId, ["publishing"], "3.4.0"))
      .toContain("cannot continue publication");
  });

  it("allows a retryable publication block to resume through idempotent publication steps", () => {
    expect(validateDeploymentContinuation({
      ...operation,
      phase: "blocked",
      lastFailure: { category: "publication", message: "registry timeout", retryable: true, previousPhase: "publishing" },
    }, operation.operationId, ["publishing"], "3.4.0")).toBeUndefined();
  });

  it("does not allow a non-retryable block through publication guards", () => {
    expect(validateDeploymentContinuation({
      ...operation,
      phase: "blocked",
      lastFailure: { category: "publication", message: "tag conflict", retryable: false, previousPhase: "publishing" },
    }, operation.operationId, ["publishing"], "3.4.0")).toContain("cannot continue publication");
  });

  it.each([["", "is required"], ["9.9.9", "version mismatch"]])("rejects an untrusted publication version %#", (version, message) => {
    expect(validateDeploymentContinuation(operation, operation.operationId, ["publishing"], version)).toContain(message);
  });
});
