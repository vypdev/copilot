export declare const RECONCILIATION_STRATEGIES: readonly ["production-lineage", "canonical-gitflow", "manual"];
export type ReconciliationStrategy = (typeof RECONCILIATION_STRATEGIES)[number];
export declare const RECONCILIATION_PR_MODES: readonly ["auto", "auto-merge", "merge-queue", "create-only", "legacy-wait"];
export type ReconciliationPullRequestMode = (typeof RECONCILIATION_PR_MODES)[number];
export declare const RECONCILIATION_BACKMERGE_MODES: readonly ["auto", "direct", "sync-branch"];
export type ReconciliationBackmergeMode = (typeof RECONCILIATION_BACKMERGE_MODES)[number];
export declare const HOTFIX_ACTIVE_RELEASE_POLICIES: readonly ["prefer-release", "development", "both"];
export type HotfixActiveReleasePolicy = (typeof HOTFIX_ACTIVE_RELEASE_POLICIES)[number];
export declare const RECONCILIATION_CLEANUP_MODES: readonly ["all", "source-only", "sync-only", "none"];
export type ReconciliationCleanupMode = (typeof RECONCILIATION_CLEANUP_MODES)[number];
export declare const RECONCILIATION_ISSUE_COMPLETION_MODES: readonly ["close", "keep-open"];
export type ReconciliationIssueCompletionMode = (typeof RECONCILIATION_ISSUE_COMPLETION_MODES)[number];
export declare const ORCHESTRATION_PRESENTATION_MODES: readonly ["guided", "compact", "quiet"];
export type OrchestrationPresentationMode = (typeof ORCHESTRATION_PRESENTATION_MODES)[number];
export declare const ORCHESTRATION_COMMENT_MODES: readonly ["update", "milestones"];
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
}
export declare const DEFAULT_DEPLOYMENT_CONFIGURATION: Readonly<DeploymentConfigurationValues>;
export interface DeploymentConfigurationValidationContext {
    readonly productionBranch: string;
    readonly developmentBranch: string;
    readonly releaseTree: string;
    readonly hotfixTree: string;
    readonly mergeQueueWorkflowSupported?: boolean;
}
export declare function validateDeploymentConfiguration(configuration: DeploymentConfigurationValues, context: DeploymentConfigurationValidationContext): string[];
export declare function isSafeBranchTree(value: string): boolean;
export declare function parseDeploymentEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): {
    value: T;
    valid: boolean;
};
