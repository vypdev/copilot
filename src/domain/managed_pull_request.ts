import type { ManagedPullRequestPhase } from "./deployment_operation";

export interface ManagedPullRequestIdentity {
  readonly operationId: string;
  readonly phase: ManagedPullRequestPhase;
  readonly issue: number;
}

const MANAGED_PULL_REQUEST_PATTERN = /<!-- copilot-deployment operation-id="([A-Za-z0-9._-]+)" phase="(promotion|reconciliation)" issue="([1-9][0-9]*)" -->/;

export function buildManagedPullRequestMarker(identity: ManagedPullRequestIdentity): string {
  if (!isSafeOperationId(identity.operationId) || !Number.isSafeInteger(identity.issue) || identity.issue < 1) {
    throw new Error("Managed pull request identity is invalid.");
  }
  return `<!-- copilot-deployment operation-id="${identity.operationId}" phase="${identity.phase}" issue="${identity.issue}" -->`;
}

export function parseManagedPullRequestMarker(body: string | null | undefined): ManagedPullRequestIdentity | undefined {
  const match = MANAGED_PULL_REQUEST_PATTERN.exec(body ?? "");
  if (!match) return undefined;
  const issue = Number(match[3]);
  if (!Number.isSafeInteger(issue) || issue < 1 || !isSafeOperationId(match[1])) return undefined;
  return { operationId: match[1], phase: match[2] as ManagedPullRequestPhase, issue };
}

export function isSafeOperationId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(value);
}
