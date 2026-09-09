import type { HotfixActiveReleasePolicy, OrchestrationCommentMode, OrchestrationPresentationMode, ReconciliationBackmergeMode, ReconciliationCleanupMode, ReconciliationIssueCompletionMode, ReconciliationPullRequestMode, ReconciliationStrategy } from "./deployment_configuration";
export declare const DEPLOYMENT_PHASES: readonly ["preparing", "promotion_pr_pending", "promoted", "publishing", "published", "reconciliation_pending", "completed", "blocked"];
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
    readonly pullRequest?: number;
    readonly status: ReconciliationTargetStatus;
}
export interface DeploymentOperationSnapshot {
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
    readonly reconciliationTargets: readonly ReconciliationTargetState[];
    readonly lastFailure?: DeploymentFailure | null;
}
export type DeploymentTransitionDecision = {
    readonly kind: "advance";
    readonly operation: DeploymentOperationSnapshot;
} | {
    readonly kind: "noop";
    readonly operation: DeploymentOperationSnapshot;
    readonly reason: string;
} | {
    readonly kind: "invalid";
    readonly operation: DeploymentOperationSnapshot;
    readonly reason: string;
};
export declare function transitionDeploymentOperation(operation: DeploymentOperationSnapshot, expectedPhase: DeploymentPhase, nextPhase: DeploymentPhase): DeploymentTransitionDecision;
export declare function blockDeploymentOperation(operation: DeploymentOperationSnapshot, category: DeploymentFailure["category"], message: string, retryable: boolean): DeploymentOperationSnapshot;
export declare function resumeBlockedDeployment(operation: DeploymentOperationSnapshot): DeploymentTransitionDecision;
export declare function completeReconciliationTarget(operation: DeploymentOperationSnapshot, pullRequest: number): DeploymentOperationSnapshot;
export declare function sanitizeDeploymentMessage(value: string): string;
export declare function isDeploymentOperationSnapshot(value: unknown): value is DeploymentOperationSnapshot;
