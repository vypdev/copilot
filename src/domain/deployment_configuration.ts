export const RECONCILIATION_STRATEGIES = [
  "production-lineage",
  "canonical-gitflow",
  "manual",
] as const;
export type ReconciliationStrategy = (typeof RECONCILIATION_STRATEGIES)[number];

export const RECONCILIATION_PR_MODES = [
  "auto",
  "auto-merge",
  "merge-queue",
  "create-only",
] as const;
export type ReconciliationPullRequestMode = (typeof RECONCILIATION_PR_MODES)[number];

export const RECONCILIATION_BACKMERGE_MODES = [
  "auto",
  "direct",
  "sync-branch",
] as const;
export type ReconciliationBackmergeMode = (typeof RECONCILIATION_BACKMERGE_MODES)[number];

export const HOTFIX_ACTIVE_RELEASE_POLICIES = [
  "prefer-release",
  "development",
  "both",
] as const;
export type HotfixActiveReleasePolicy = (typeof HOTFIX_ACTIVE_RELEASE_POLICIES)[number];

export const RECONCILIATION_CLEANUP_MODES = [
  "all",
  "source-only",
  "sync-only",
  "none",
] as const;
export type ReconciliationCleanupMode = (typeof RECONCILIATION_CLEANUP_MODES)[number];

export const RECONCILIATION_ISSUE_COMPLETION_MODES = ["close", "keep-open"] as const;
export type ReconciliationIssueCompletionMode = (typeof RECONCILIATION_ISSUE_COMPLETION_MODES)[number];

export const ORCHESTRATION_PRESENTATION_MODES = ["guided", "compact", "quiet"] as const;
export type OrchestrationPresentationMode = (typeof ORCHESTRATION_PRESENTATION_MODES)[number];

export const ORCHESTRATION_COMMENT_MODES = ["update", "milestones"] as const;
export type OrchestrationCommentMode = (typeof ORCHESTRATION_COMMENT_MODES)[number];

export interface DeploymentConfigurationValues {
  releaseReconciliationStrategy: ReconciliationStrategy;
  hotfixReconciliationStrategy: ReconciliationStrategy;
  reconciliationPullRequestMode: ReconciliationPullRequestMode;
  reconciliationBackmergeMode: ReconciliationBackmergeMode;
  hotfixActiveReleasePolicy: HotfixActiveReleasePolicy;
  reconciliationTree: string;
  reconciliationCleanup: ReconciliationCleanupMode;
  reconciliationIssueCompletion: ReconciliationIssueCompletionMode;
  orchestrationPresentationMode: OrchestrationPresentationMode;
  orchestrationDiagrams: boolean;
  orchestrationCommentMode: OrchestrationCommentMode;
  mergeQueueCheckAttestations: readonly MergeQueueCheckAttestation[];
}

export const DEFAULT_DEPLOYMENT_CONFIGURATION: Readonly<DeploymentConfigurationValues> = {
  releaseReconciliationStrategy: "production-lineage",
  hotfixReconciliationStrategy: "production-lineage",
  reconciliationPullRequestMode: "auto",
  reconciliationBackmergeMode: "auto",
  hotfixActiveReleasePolicy: "prefer-release",
  reconciliationTree: "sync",
  reconciliationCleanup: "all",
  reconciliationIssueCompletion: "close",
  orchestrationPresentationMode: "guided",
  orchestrationDiagrams: true,
  orchestrationCommentMode: "update",
  mergeQueueCheckAttestations: [],
};

export interface DeploymentConfigurationValidationContext {
  readonly productionBranch: string;
  readonly developmentBranch: string;
  readonly releaseTree: string;
  readonly hotfixTree: string;
}

export function validateDeploymentConfiguration(
  configuration: DeploymentConfigurationValues,
  context: DeploymentConfigurationValidationContext,
): string[] {
  const errors: string[] = [];
  for (const [name, value, allowed] of [
    ["release reconciliation strategy", configuration.releaseReconciliationStrategy, RECONCILIATION_STRATEGIES],
    ["hotfix reconciliation strategy", configuration.hotfixReconciliationStrategy, RECONCILIATION_STRATEGIES],
    ["reconciliation PR mode", configuration.reconciliationPullRequestMode, RECONCILIATION_PR_MODES],
    ["reconciliation back-merge mode", configuration.reconciliationBackmergeMode, RECONCILIATION_BACKMERGE_MODES],
    ["hotfix active-release policy", configuration.hotfixActiveReleasePolicy, HOTFIX_ACTIVE_RELEASE_POLICIES],
    ["reconciliation cleanup", configuration.reconciliationCleanup, RECONCILIATION_CLEANUP_MODES],
    ["reconciliation issue completion", configuration.reconciliationIssueCompletion, RECONCILIATION_ISSUE_COMPLETION_MODES],
    ["orchestration presentation mode", configuration.orchestrationPresentationMode, ORCHESTRATION_PRESENTATION_MODES],
    ["orchestration comment mode", configuration.orchestrationCommentMode, ORCHESTRATION_COMMENT_MODES],
  ] as const) {
    if (!(allowed as readonly unknown[]).includes(value)) {
      errors.push(`The ${name} must be one of: ${allowed.join(", ")}.`);
    }
  }
  if (typeof configuration.orchestrationDiagrams !== "boolean") {
    errors.push("Orchestration diagrams must be a boolean.");
  }
  if (context.productionBranch === context.developmentBranch) {
    errors.push("Production and development branches must be different.");
  }
  const protectedNames = new Set([context.productionBranch, context.developmentBranch]);
  for (const [label, tree] of [
    ["release", context.releaseTree],
    ["hotfix", context.hotfixTree],
    ["reconciliation", configuration.reconciliationTree],
  ] as const) {
    if (!isSafeBranchTree(tree)) {
      errors.push(`The ${label} branch prefix must be a safe, non-empty Git ref segment.`);
    } else if (protectedNames.has(tree)) {
      errors.push(`The ${label} branch prefix cannot equal a protected long-lived branch.`);
    }
  }
  errors.push(...normalizeMergeQueueCheckAttestations(configuration.mergeQueueCheckAttestations).errors);
  if ((configuration.releaseReconciliationStrategy === "manual"
      || configuration.hotfixReconciliationStrategy === "manual")
      && configuration.reconciliationIssueCompletion === "close") {
    errors.push("Manual reconciliation cannot close the launcher issue automatically.");
  }
  return errors;
}

export function isSafeBranchTree(value: string): boolean {
  const tree = value.trim();
  return tree.length > 0
    && tree.length <= 100
    && !tree.startsWith("/")
    && !tree.endsWith("/")
    && !tree.includes("..")
    && !tree.includes("@{")
    && !/[~^:?*[\\\]\s]/.test(tree);
}

export function parseDeploymentEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): { value: T; valid: boolean } {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { value: fallback, valid: true };
  }
  const normalized = String(value).trim();
  return allowed.includes(normalized as T)
    ? { value: normalized as T, valid: true }
    : { value: fallback, valid: false };
}
import {
  normalizeMergeQueueCheckAttestations,
  type MergeQueueCheckAttestation,
} from "./merge_queue_readiness";
