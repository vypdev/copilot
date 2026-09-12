import {
  DEPLOYMENT_STATE_VERSION,
  isDeploymentOperationSnapshot,
  type DeploymentOperationSnapshot,
  type DeploymentPhase,
} from "./deployment_operation";

export interface DeploymentStateFence {
  readonly operationId: string;
  readonly phase: DeploymentPhase;
  readonly revision: number;
}

export type ExpectedDeploymentState =
  | { readonly kind: "absent" }
  | { readonly kind: "current"; readonly fence: DeploymentStateFence };

export type DeploymentStateLoadOutcome =
  | { readonly kind: "absent" }
  | { readonly kind: "current"; readonly operation: DeploymentOperationSnapshot }
  | { readonly kind: "unsupported"; readonly stateVersion: unknown }
  | { readonly kind: "invalid"; readonly reason: string };

export type DeploymentStateSaveOutcome =
  | { readonly kind: "saved"; readonly operation: DeploymentOperationSnapshot }
  | { readonly kind: "already-applied"; readonly operation: DeploymentOperationSnapshot }
  | { readonly kind: "stale"; readonly operation: DeploymentOperationSnapshot }
  | { readonly kind: "missing" }
  | { readonly kind: "conflict"; readonly operation: DeploymentOperationSnapshot }
  | { readonly kind: "invalid"; readonly reason: string };

export type DeploymentStateSaveDecision =
  | { readonly kind: "write" }
  | Exclude<DeploymentStateSaveOutcome, { readonly kind: "saved" }>;

export function readDeploymentOperationState(value: unknown): DeploymentStateLoadOutcome {
  if (value === undefined || value === null) return { kind: "absent" };
  if (!isRecord(value)) return { kind: "invalid", reason: "Deployment state must be an object." };
  if (!("stateVersion" in value)) {
    return { kind: "invalid", reason: "Deployment stateVersion is required." };
  }
  if (value.stateVersion !== DEPLOYMENT_STATE_VERSION) {
    return { kind: "unsupported", stateVersion: value.stateVersion };
  }
  if (!isDeploymentOperationSnapshot(value)) {
    return { kind: "invalid", reason: "Deployment state version 1 is malformed or incomplete." };
  }
  return { kind: "current", operation: value };
}

export function deploymentStateFence(operation: DeploymentOperationSnapshot): DeploymentStateFence {
  return {
    operationId: operation.operationId,
    phase: operation.phase,
    revision: operation.revision,
  };
}

export function nextDeploymentRevision(expected: ExpectedDeploymentState): number | undefined {
  if (expected.kind === "absent") return 1;
  return expected.fence.revision < Number.MAX_SAFE_INTEGER
    ? expected.fence.revision + 1
    : undefined;
}

export function decideDeploymentStateSave(
  actual: DeploymentStateLoadOutcome,
  expected: ExpectedDeploymentState,
  proposed: DeploymentOperationSnapshot,
): DeploymentStateSaveDecision {
  const proposedRead = readDeploymentOperationState(proposed);
  if (proposedRead.kind !== "current") {
    return { kind: "invalid", reason: "Proposed deployment state is not a valid version-1 snapshot." };
  }
  const nextRevision = nextDeploymentRevision(expected);
  if (nextRevision === undefined || proposed.revision !== nextRevision) {
    return { kind: "invalid", reason: "Proposed deployment revision is not the exact monotonic successor." };
  }
  if (actual.kind === "invalid") return actual;
  if (actual.kind === "unsupported") {
    return { kind: "invalid", reason: `Stored deployment state version ${String(actual.stateVersion)} is unsupported.` };
  }
  if (actual.kind === "absent") {
    return expected.kind === "absent" ? { kind: "write" } : { kind: "missing" };
  }
  if (sameSemanticState(actual.operation, proposed)) {
    return { kind: "already-applied", operation: actual.operation };
  }
  const expectedOperationId = expected.kind === "current" ? expected.fence.operationId : undefined;
  if (actual.operation.operationId !== (expectedOperationId ?? proposed.operationId)) {
    return { kind: "conflict", operation: actual.operation };
  }
  if (expected.kind === "absent") {
    return { kind: "stale", operation: actual.operation };
  }
  if (actual.operation.revision !== expected.fence.revision
      || actual.operation.phase !== expected.fence.phase) {
    return { kind: "stale", operation: actual.operation };
  }
  return { kind: "write" };
}

function sameSemanticState(
  left: DeploymentOperationSnapshot,
  right: DeploymentOperationSnapshot,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
