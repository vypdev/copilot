import type {
  HotfixActiveReleasePolicy,
  OrchestrationCommentMode,
  OrchestrationPresentationMode,
  ReconciliationBackmergeMode,
  ReconciliationCleanupMode,
  ReconciliationIssueCompletionMode,
  ReconciliationPullRequestMode,
  ReconciliationStrategy,
} from "./deployment_configuration";
import {
  HOTFIX_ACTIVE_RELEASE_POLICIES,
  ORCHESTRATION_COMMENT_MODES,
  ORCHESTRATION_PRESENTATION_MODES,
  RECONCILIATION_BACKMERGE_MODES,
  RECONCILIATION_CLEANUP_MODES,
  RECONCILIATION_ISSUE_COMPLETION_MODES,
  RECONCILIATION_PR_MODES,
  RECONCILIATION_STRATEGIES,
} from "./deployment_configuration";

export const DEPLOYMENT_PHASES = [
  "preparing",
  "promotion_pr_pending",
  "promoted",
  "publishing",
  "published",
  "reconciliation_pending",
  "completed",
  "blocked",
] as const;
export const DEPLOYMENT_STATE_VERSION = 1 as const;
export type DeploymentPhase = (typeof DEPLOYMENT_PHASES)[number];
export type DeploymentKind = "release" | "hotfix";
export type ManagedPullRequestPhase = "promotion" | "reconciliation";
export type ReconciliationTargetStatus = "pending" | "completed" | "blocked";

export interface DeploymentFailure {
  readonly category: "promotion" | "publication" | "reconciliation" | "cleanup";
  readonly message: string;
  readonly retryable: boolean;
  readonly previousPhase: Exclude<DeploymentPhase, "blocked">;
}

export interface ReconciliationTargetState {
  readonly targetBranch: string;
  readonly sourceBranch: string;
  readonly sourceSha: string;
  readonly syncBranch?: string;
  readonly syncSha?: string;
  readonly pullRequest?: number;
  readonly status: ReconciliationTargetStatus;
}

export interface DeploymentPublicationReceipt {
  readonly tag: string;
  readonly productionSha: string;
  readonly operationId: string;
  readonly releaseUrl: string;
}

export interface DeploymentOperationSnapshot {
  readonly stateVersion: typeof DEPLOYMENT_STATE_VERSION;
  readonly revision: number;
  readonly operationId: string;
  readonly kind: DeploymentKind;
  readonly version: string;
  readonly title: string;
  readonly changelog: string;
  readonly phase: DeploymentPhase;
  readonly strategy: ReconciliationStrategy;
  readonly prMode: ReconciliationPullRequestMode;
  readonly selectedPrMode?: Exclude<ReconciliationPullRequestMode, "auto">;
  readonly backmergeMode: ReconciliationBackmergeMode;
  readonly hotfixActiveReleasePolicy: HotfixActiveReleasePolicy;
  readonly cleanup: ReconciliationCleanupMode;
  readonly issueCompletion: ReconciliationIssueCompletionMode;
  readonly presentationMode: OrchestrationPresentationMode;
  readonly diagrams: boolean;
  readonly commentMode: OrchestrationCommentMode;
  readonly sourceBranch: string;
  readonly sourceSha: string;
  readonly originBranch: string;
  readonly originSha: string;
  readonly productionBranch: string;
  readonly developmentBranch: string;
  readonly reconciliationTree: string;
  readonly promotionPullRequest?: number;
  readonly productionSha?: string;
  readonly tag: string;
  readonly publicationWorkflow: string;
  readonly publicationVerified: boolean;
  readonly publicationReceipt?: DeploymentPublicationReceipt;
  readonly reconciliationTargets: readonly ReconciliationTargetState[];
  readonly lastFailure?: DeploymentFailure | null;
}

const NORMAL_TRANSITIONS: Readonly<Record<Exclude<DeploymentPhase, "blocked">, readonly DeploymentPhase[]>> = {
  preparing: ["promotion_pr_pending"],
  promotion_pr_pending: ["promoted"],
  promoted: ["publishing"],
  publishing: ["published"],
  published: ["reconciliation_pending", "completed"],
  reconciliation_pending: ["completed"],
  completed: [],
};

export type DeploymentTransitionDecision =
  | { readonly kind: "advance"; readonly operation: DeploymentOperationSnapshot }
  | { readonly kind: "noop"; readonly operation: DeploymentOperationSnapshot; readonly reason: string }
  | { readonly kind: "invalid"; readonly operation: DeploymentOperationSnapshot; readonly reason: string };

export function transitionDeploymentOperation(
  operation: DeploymentOperationSnapshot,
  expectedPhase: DeploymentPhase,
  nextPhase: DeploymentPhase,
): DeploymentTransitionDecision {
  if (operation.phase === nextPhase) {
    return { kind: "noop", operation, reason: `Operation is already ${nextPhase}.` };
  }
  if (operation.phase !== expectedPhase) {
    return { kind: "noop", operation, reason: `Expected ${expectedPhase}, found ${operation.phase}.` };
  }
  if (nextPhase === "blocked") {
    return { kind: "advance", operation: { ...operation, phase: nextPhase } };
  }
  if (expectedPhase === "blocked" || !NORMAL_TRANSITIONS[expectedPhase].includes(nextPhase)) {
    return { kind: "invalid", operation, reason: `Transition ${expectedPhase} -> ${nextPhase} is not allowed.` };
  }
  return { kind: "advance", operation: { ...operation, phase: nextPhase, lastFailure: null } };
}

export function blockDeploymentOperation(
  operation: DeploymentOperationSnapshot,
  category: DeploymentFailure["category"],
  message: string,
  retryable: boolean,
): DeploymentOperationSnapshot {
  if (operation.phase === "completed") return operation;
  const previousPhase = operation.phase === "blocked"
    ? operation.lastFailure?.previousPhase ?? "preparing"
    : operation.phase;
  return {
    ...operation,
    phase: "blocked",
    lastFailure: { category, message: sanitizeDeploymentMessage(message), retryable, previousPhase },
  };
}

export function resumeBlockedDeployment(operation: DeploymentOperationSnapshot): DeploymentTransitionDecision {
  if (operation.phase !== "blocked" || !operation.lastFailure?.retryable) {
    return { kind: "invalid", operation, reason: "Operation is not retryable from blocked state." };
  }
  return {
    kind: "advance",
    operation: { ...operation, phase: operation.lastFailure.previousPhase, lastFailure: null },
  };
}

export function completeReconciliationTarget(
  operation: DeploymentOperationSnapshot,
  pullRequest: number,
): DeploymentOperationSnapshot {
  const targets = operation.reconciliationTargets.map((target) =>
    target.pullRequest === pullRequest ? { ...target, status: "completed" as const } : target,
  );
  return {
    ...operation,
    reconciliationTargets: targets,
    lastFailure: null,
  };
}

export function sanitizeDeploymentMessage(value: string): string {
  return value
    .replace(/::/g, "﹕﹕")
    .replace(/@(?=[A-Za-z0-9_-])/g, "@\u200b")
    .replace(/<!--/g, "&lt;!--")
    .replace(/-->/g, "--&gt;")
    .slice(0, 2_000);
}

export function isDeploymentOperationSnapshot(value: unknown): value is DeploymentOperationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Partial<DeploymentOperationSnapshot>;
  return operation.stateVersion === DEPLOYMENT_STATE_VERSION
    && typeof operation.revision === "number"
    && Number.isSafeInteger(operation.revision)
    && operation.revision > 0
    && typeof operation.operationId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(operation.operationId)
    && (operation.kind === "release" || operation.kind === "hotfix")
    && typeof operation.version === "string" && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(operation.version)
    && typeof operation.title === "string" && operation.title.length <= 1_000
    && typeof operation.changelog === "string" && operation.changelog.length <= 50_000
    && DEPLOYMENT_PHASES.includes(operation.phase as DeploymentPhase)
    && RECONCILIATION_STRATEGIES.includes(operation.strategy as ReconciliationStrategy)
    && RECONCILIATION_PR_MODES.includes(operation.prMode as ReconciliationPullRequestMode)
    && (operation.selectedPrMode === undefined
      || ["auto-merge", "merge-queue", "create-only"].includes(operation.selectedPrMode))
    && RECONCILIATION_BACKMERGE_MODES.includes(operation.backmergeMode as ReconciliationBackmergeMode)
    && HOTFIX_ACTIVE_RELEASE_POLICIES.includes(operation.hotfixActiveReleasePolicy as HotfixActiveReleasePolicy)
    && RECONCILIATION_CLEANUP_MODES.includes(operation.cleanup as ReconciliationCleanupMode)
    && RECONCILIATION_ISSUE_COMPLETION_MODES.includes(operation.issueCompletion as ReconciliationIssueCompletionMode)
    && ORCHESTRATION_PRESENTATION_MODES.includes(operation.presentationMode as OrchestrationPresentationMode)
    && typeof operation.diagrams === "boolean"
    && ORCHESTRATION_COMMENT_MODES.includes(operation.commentMode as OrchestrationCommentMode)
    && isSafePersistedRef(operation.sourceBranch)
    && isFullSha(operation.sourceSha)
    && isSafePersistedRef(operation.originBranch)
    && isFullSha(operation.originSha)
    && isSafePersistedRef(operation.productionBranch)
    && isSafePersistedRef(operation.developmentBranch)
    && typeof operation.reconciliationTree === "string"
    && typeof operation.tag === "string" && operation.tag === `v${operation.version}`
    && typeof operation.publicationWorkflow === "string" && isSafeWorkflowName(operation.publicationWorkflow)
    && (operation.promotionPullRequest === undefined || isPositiveInteger(operation.promotionPullRequest))
    && (operation.productionSha === undefined || isFullSha(operation.productionSha))
    && typeof operation.publicationVerified === "boolean"
    && isPublicationReceiptConsistent(operation)
    && Array.isArray(operation.reconciliationTargets)
    && operation.reconciliationTargets.every(isReconciliationTarget)
    && (operation.lastFailure === undefined || operation.lastFailure === null || isDeploymentFailure(operation.lastFailure));
}

function isPublicationReceiptConsistent(operation: Partial<DeploymentOperationSnapshot>): boolean {
  const receipt = operation.publicationReceipt;
  if (!receipt) return operation.publicationVerified === false;
  return operation.publicationVerified === true
    && receipt.tag === operation.tag
    && receipt.operationId === operation.operationId
    && receipt.productionSha === operation.productionSha
    && isFullSha(receipt.productionSha)
    && typeof receipt.releaseUrl === "string"
    && receipt.releaseUrl.length > 0
    && receipt.releaseUrl.length <= 2_000
    && /^https:\/\//.test(receipt.releaseUrl);
}

function isFullSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSafePersistedRef(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && !value.includes("..")
    && !value.includes("@{")
    && !/[\s~^:?*[\\\]]/.test(value);
}

function isSafeWorkflowName(value: string): boolean {
  return value.length <= 200 && !value.includes("..") && /^[A-Za-z0-9][A-Za-z0-9._/-]*\.ya?ml$/.test(value);
}

function isReconciliationTarget(value: unknown): value is ReconciliationTargetState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Partial<ReconciliationTargetState>;
  return isSafePersistedRef(target.targetBranch)
    && isSafePersistedRef(target.sourceBranch)
    && isFullSha(target.sourceSha)
    && (target.syncBranch === undefined || isSafePersistedRef(target.syncBranch))
    && (target.syncSha === undefined || (target.syncBranch !== undefined && isFullSha(target.syncSha)))
    && (target.pullRequest === undefined || isPositiveInteger(target.pullRequest))
    && !(target.syncBranch !== undefined && target.pullRequest !== undefined && target.syncSha === undefined)
    && ["pending", "completed", "blocked"].includes(target.status as ReconciliationTargetStatus);
}

function isDeploymentFailure(value: unknown): value is DeploymentFailure {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const failure = value as Partial<DeploymentFailure>;
  return ["promotion", "publication", "reconciliation", "cleanup"].includes(failure.category as DeploymentFailure["category"])
    && typeof failure.message === "string"
    && failure.message.length <= 2_000
    && typeof failure.retryable === "boolean"
    && ["preparing", "promotion_pr_pending", "promoted", "publishing", "published", "reconciliation_pending", "completed"]
      .includes(failure.previousPhase as Exclude<DeploymentPhase, "blocked">);
}
