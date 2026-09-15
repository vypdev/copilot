import { requiredDeploymentFailure, type DeploymentOperationSnapshot, type DeploymentPhase } from "../../domain/deployment_operation";

/**
 * Rejects forged, stale, or out-of-order workflow continuations before a
 * publication-side mutation is attempted. Every publication command belongs to
 * one current, durable operation contract.
 */
export function validateDeploymentContinuation(
  operation: DeploymentOperationSnapshot | undefined,
  expectedOperationId: string,
  allowedPhases: readonly DeploymentPhase[],
  expectedVersion?: string,
): string | undefined {
  if (!operation) return "A durable deployment operation is required for publication.";
  if (!expectedOperationId) return "single-action-operation-id is required for a durable deployment continuation.";
  if (expectedOperationId !== operation.operationId) {
    return `Deployment operation mismatch: expected ${operation.operationId}, received ${expectedOperationId}.`;
  }
  if (!expectedVersion) return "single-action-version is required for a durable publication continuation.";
  if (expectedVersion !== operation.version) {
    return `Deployment version mismatch: expected ${operation.version}, received ${expectedVersion}.`;
  }
  const blockedFailure = operation.phase === 'blocked' ? requiredDeploymentFailure(operation) : undefined;
  const effectivePhase = blockedFailure?.retryable ? blockedFailure.previousPhase : operation.phase;
  if (!allowedPhases.includes(effectivePhase)) {
    return `Deployment operation ${operation.operationId} cannot continue publication from phase ${operation.phase}.`;
  }
  return undefined;
}
