import type { DeploymentOperationSnapshot, DeploymentPhase } from "../../domain/deployment_operation";

/**
 * Rejects forged, stale, or out-of-order workflow continuations before a
 * publication-side mutation is attempted. Standalone publication commands
 * that do not belong to an orchestration operation are validated separately.
 */
export function validateDeploymentContinuation(
  operation: DeploymentOperationSnapshot | undefined,
  expectedOperationId: string,
  allowedPhases: readonly DeploymentPhase[],
  expectedVersion?: string,
): string | undefined {
  if (!operation) return undefined;
  if (!expectedOperationId) return "single-action-operation-id is required for a durable deployment continuation.";
  if (expectedOperationId !== operation.operationId) {
    return `Deployment operation mismatch: expected ${operation.operationId}, received ${expectedOperationId}.`;
  }
  if (!expectedVersion) return "single-action-version is required for a durable publication continuation.";
  if (expectedVersion !== operation.version) {
    return `Deployment version mismatch: expected ${operation.version}, received ${expectedVersion}.`;
  }
  const effectivePhase = operation.phase === "blocked" && operation.lastFailure?.retryable
    ? operation.lastFailure.previousPhase
    : operation.phase;
  if (!allowedPhases.includes(effectivePhase)) {
    return `Deployment operation ${operation.operationId} cannot continue publication from phase ${operation.phase}.`;
  }
  return undefined;
}
