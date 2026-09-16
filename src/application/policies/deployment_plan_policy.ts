import type { DeploymentConfigurationValues, ReconciliationPullRequestMode } from "../../domain/deployment_configuration";
import type {
  DeploymentKind,
  DeploymentOperationSnapshot,
  ReconciliationTargetState,
} from "../../domain/deployment_operation";
import { DEPLOYMENT_STATE_VERSION } from "../../domain/deployment_operation";
import type {
  MergeQueueObservationProblem,
  MergeQueueProducerEvidence,
  MergeQueueReadiness,
} from "../../domain/merge_queue_readiness";
import type { LocaleProfile } from '../../domain/locale';
import {
  renderMergeQueueReadinessFailure,
  type MergeQueueMessageId,
  type MergeQueueMessageView,
} from './merge_queue_message_catalog';

export interface InitialDeploymentOperationInput {
  readonly operationId: string;
  readonly locale: LocaleProfile;
  readonly kind: DeploymentKind;
  readonly version: string;
  readonly title: string;
  readonly changelog: string;
  readonly sourceBranch: string;
  readonly sourceSha: string;
  readonly originBranch: string;
  readonly originSha: string;
  readonly productionBranch: string;
  readonly developmentBranch: string;
  readonly configuration: DeploymentConfigurationValues;
  readonly publicationWorkflow: string;
}

export type InitialDeploymentOperation = DeploymentOperationSnapshot & {
  readonly locale: LocaleProfile;
};

export function buildInitialDeploymentOperation(
  input: InitialDeploymentOperationInput,
): InitialDeploymentOperation {
  const strategy = input.kind === "release"
    ? input.configuration.releaseReconciliationStrategy
    : input.configuration.hotfixReconciliationStrategy;
  return {
    stateVersion: DEPLOYMENT_STATE_VERSION,
    revision: 0,
    operationId: input.operationId,
    locale: Object.freeze({ ...input.locale }),
    kind: input.kind,
    version: input.version,
    title: input.title,
    changelog: input.changelog,
    phase: "preparing",
    strategy,
    prMode: input.configuration.reconciliationPullRequestMode,
    backmergeMode: input.configuration.reconciliationBackmergeMode,
    hotfixActiveReleasePolicy: input.configuration.hotfixActiveReleasePolicy,
    cleanup: input.configuration.reconciliationCleanup,
    issueCompletion: input.configuration.reconciliationIssueCompletion,
    presentationMode: input.configuration.orchestrationPresentationMode,
    diagrams: input.configuration.orchestrationDiagrams,
    commentMode: input.configuration.orchestrationCommentMode,
    sourceBranch: input.sourceBranch,
    sourceSha: input.sourceSha,
    originBranch: input.originBranch,
    originSha: input.originSha,
    productionBranch: input.productionBranch,
    developmentBranch: input.developmentBranch,
    reconciliationTree: input.configuration.reconciliationTree,
    tag: `v${input.version}`,
    publicationWorkflow: input.publicationWorkflow,
    publicationVerified: false,
    reconciliationTargets: [],
    lastFailure: null,
  };
}

export interface TargetMergeCapabilities {
  readonly autoMergeAllowed: boolean;
  readonly mergeQueueRequired: boolean;
  readonly immediatelyMergeable: boolean;
  readonly requiresStrictStatusChecks: boolean;
  readonly mergeQueueProducers: readonly MergeQueueProducerEvidence[];
  readonly mergeQueueObservationProblems: readonly MergeQueueObservationProblem[];
}

export type PullRequestModeDecisionReason =
  | 'explicit-create-only'
  | 'policy-observation-failed'
  | 'auto-merge-rejected'
  | 'queue-required'
  | 'queue-not-exposed'
  | 'auto-merge-configured'
  | 'auto-merge-disabled'
  | 'immediately-mergeable'
  | 'auto-merge-available'
  | 'create-only-required';

type PullRequestModeDecisionContext = {
  readonly reasonCode: PullRequestModeDecisionReason;
};

export type PullRequestModeDecision =
  | (PullRequestModeDecisionContext & {
      readonly kind: "mode";
      readonly mode: Exclude<ReconciliationPullRequestMode, "auto">;
    })
  | (PullRequestModeDecisionContext & { readonly kind: "unsupported" });

export function selectPullRequestMode(
  configured: ReconciliationPullRequestMode,
  capabilities: TargetMergeCapabilities,
): PullRequestModeDecision {
  if (configured === "create-only") {
    return { kind: "mode", mode: configured, reasonCode: 'explicit-create-only' };
  }
  if (capabilities.mergeQueueObservationProblems.length > 0) {
    return {
      kind: "unsupported",
      reasonCode: 'policy-observation-failed',
    };
  }
  if (capabilities.mergeQueueRequired) {
    return configured === "auto-merge"
      ? { kind: "unsupported", reasonCode: 'auto-merge-rejected' }
      : { kind: "mode", mode: "merge-queue", reasonCode: 'queue-required' };
  }
  if (configured === "merge-queue") {
    return { kind: "unsupported", reasonCode: 'queue-not-exposed' };
  }
  if (configured === "auto-merge") {
    return capabilities.autoMergeAllowed
      ? { kind: "mode", mode: "auto-merge", reasonCode: 'auto-merge-configured' }
      : { kind: "unsupported", reasonCode: 'auto-merge-disabled' };
  }
  if (capabilities.immediatelyMergeable) {
    return { kind: "mode", mode: "auto-merge", reasonCode: 'immediately-mergeable' };
  }
  return capabilities.autoMergeAllowed
    ? { kind: "mode", mode: "auto-merge", reasonCode: 'auto-merge-available' }
    : { kind: "mode", mode: "create-only", reasonCode: 'create-only-required' };
}

export function pullRequestModeDecisionMessage(
  decision: PullRequestModeDecision,
  catalog: MergeQueueMessageView,
): string {
  const ids: Readonly<Record<PullRequestModeDecisionReason, MergeQueueMessageId>> = {
    'explicit-create-only': 'mergeQueue.decision.explicitCreateOnly',
    'policy-observation-failed': 'mergeQueue.decision.policyObservationFailed',
    'auto-merge-rejected': 'mergeQueue.decision.autoMergeRejected',
    'queue-required': 'mergeQueue.decision.queueRequired',
    'queue-not-exposed': 'mergeQueue.decision.queueNotExposed',
    'auto-merge-configured': 'mergeQueue.decision.autoMergeConfigured',
    'auto-merge-disabled': 'mergeQueue.decision.autoMergeDisabled',
    'immediately-mergeable': 'mergeQueue.decision.immediatelyMergeable',
    'auto-merge-available': 'mergeQueue.decision.autoMergeAvailable',
    'create-only-required': 'mergeQueue.decision.createOnlyRequired',
  };
  return catalog.message(ids[decision.reasonCode]);
}

export function mergeQueueReadinessFailureMessage(
  readiness: MergeQueueReadiness,
  catalog: MergeQueueMessageView,
): string {
  return renderMergeQueueReadinessFailure(readiness, catalog);
}

export type BackmergeModeDecision =
  | { readonly kind: "mode"; readonly mode: "direct" | "sync-branch"; readonly reason: string }
  | { readonly kind: "unsupported"; readonly reason: string };

export function selectBackmergeMode(
  configured: DeploymentOperationSnapshot["backmergeMode"],
  requiresStrictStatusChecks: boolean,
  directHeadIsUpToDate: boolean,
  directSourceIsExact: boolean = true,
): BackmergeModeDecision {
  const directIsUnsafe = !directSourceIsExact
    || (requiresStrictStatusChecks && !directHeadIsUpToDate);
  if (configured === "direct" && directIsUnsafe) {
    const reason = !directSourceIsExact
      ? "Direct reconciliation was rejected because its source branch no longer points at the stored release SHA. Use auto or sync-branch to keep this operation isolated."
      : "Direct reconciliation cannot satisfy the target's strict up-to-date rule without merging development into production. Use auto or sync-branch.";
    return { kind: "unsupported", reason };
  }
  if (configured === "sync-branch" || (configured === "auto" && directIsUnsafe)) {
    return {
      kind: "mode",
      mode: "sync-branch",
      reason: !directSourceIsExact
        ? "A dedicated sync branch pins the stored release SHA after the source branch advanced."
        : "A dedicated sync branch satisfies the target's strict up-to-date rule without changing production.",
    };
  }
  return { kind: "mode", mode: "direct", reason: "The exact source can be reconciled directly into this target." };
}

export type ReconciliationTargetDecision =
  | { readonly kind: "targets"; readonly targetBranches: readonly string[] }
  | { readonly kind: "manual" }
  | { readonly kind: "blocked"; readonly reason: string };

export function selectReconciliationTargetBranches(
  operation: DeploymentOperationSnapshot,
  activeReleaseBranches: readonly string[],
): ReconciliationTargetDecision {
  if (operation.strategy === "manual") return { kind: "manual" };
  if (operation.kind === "release") {
    return { kind: "targets", targetBranches: [operation.developmentBranch] };
  }
  const releases = [...new Set(activeReleaseBranches.filter(Boolean))];
  if (operation.hotfixActiveReleasePolicy !== "development" && releases.length > 1) {
    return { kind: "blocked", reason: "Multiple active release branches require an explicit hotfix reconciliation decision." };
  }
  if (operation.hotfixActiveReleasePolicy === "development" || releases.length === 0) {
    return { kind: "targets", targetBranches: [operation.developmentBranch] };
  }
  if (operation.hotfixActiveReleasePolicy === "prefer-release") {
    return { kind: "targets", targetBranches: releases };
  }
  return { kind: "targets", targetBranches: [...releases, operation.developmentBranch] };
}

export function reconciliationSource(operation: DeploymentOperationSnapshot): { branch: string; sha: string } {
  return operation.strategy === "canonical-gitflow"
    ? { branch: operation.sourceBranch, sha: operation.sourceSha }
    : { branch: operation.productionBranch, sha: operation.productionSha ?? "" };
}

export function buildReconciliationTarget(
  operation: DeploymentOperationSnapshot,
  targetBranch: string,
  mode: "direct" | "sync-branch",
): ReconciliationTargetState {
  const source = reconciliationSource(operation);
  return {
    targetBranch,
    sourceBranch: source.branch,
    sourceSha: source.sha,
    syncBranch: mode === "sync-branch" ? buildReconciliationBranchName(operation, targetBranch) : undefined,
    status: "pending",
  };
}

export function buildReconciliationBranchName(
  operation: Pick<DeploymentOperationSnapshot, "reconciliationTree" | "kind" | "version" | "operationId">,
  targetBranch: string,
): string {
  const safeTarget = targetBranch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const safeOperation = operation.operationId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();
  return `${operation.reconciliationTree}/${operation.kind}-${operation.version}-to-${safeTarget}-${safeOperation}`;
}

export function validateInitialDeploymentInput(input: InitialDeploymentOperationInput): string[] {
  const errors: string[] = [];
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(input.version)) errors.push("Version must use MAJOR.MINOR.PATCH format.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(input.sourceBranch)) errors.push("Source branch is invalid.");
  if (!/^[a-f0-9]{40}$/i.test(input.sourceSha)) errors.push("Source SHA must be a full commit SHA.");
  if (!/^[a-f0-9]{40}$/i.test(input.originSha)) errors.push("Origin SHA must be a full commit SHA.");
  if (input.sourceBranch === input.productionBranch || input.sourceBranch === input.developmentBranch) {
    errors.push("A frozen release/hotfix branch is required as the deployment source.");
  }
  return errors;
}
