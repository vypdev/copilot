import { ApplicationError, toApplicationError } from "../errors/application_error";
import type {
  DeploymentOrchestrationContext,
  ManagedPullRequestRecord,
} from "../ports/deployment_orchestration_ports";
import {
  mergeQueueReadinessFailureMessage,
  selectPullRequestMode,
  type PullRequestModeDecision,
  type TargetMergeCapabilities,
} from "../policies/deployment_plan_policy";
import {
  deploymentDashboardMarker,
  renderDeploymentDashboard,
  renderPromotionPullRequest,
  renderReconciliationPullRequest,
  type DeploymentPresentationContext,
} from "../policies/deployment_presentation_policy";
import {
  blockDeploymentOperation,
  type DeploymentOperationSnapshot,
  type ReconciliationTargetState,
} from "../../domain/deployment_operation";
import {
  evaluateMergeQueueReadiness,
  type MergeQueueTargetRole,
} from "../../domain/merge_queue_readiness";
import { Result } from "../../data/model/result";
import { sanitizePublishedError } from "../policies/github_comment_publication_policy";
import type { DeploymentOrchestrationDependencies } from "./deployment_orchestration_dependencies";
import { DeploymentStateBoundary } from "./deployment_state_boundary";

export const DEPLOYMENT_ORCHESTRATION_TASK_ID = "DeploymentOrchestrationUseCase";

export class DeploymentOrchestrationRuntime {
  constructor(
    readonly dependencies: DeploymentOrchestrationDependencies,
    readonly stateBoundary: DeploymentStateBoundary,
  ) {}

  async persist(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<void> {
    context.currentConfiguration.deploymentOrchestration = operation;
    await this.stateBoundary.persist(context);
  }

  async block(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    category: "promotion" | "publication" | "reconciliation" | "cleanup",
    message: string,
    retryable: boolean,
    semanticError?: ApplicationError,
  ): Promise<Result> {
    const blocked = blockDeploymentOperation(operation, category, message, retryable);
    await this.persist(context, blocked);
    await this.publishDashboard(context, blocked);
    await this.publishMilestone(
      context,
      blocked,
      "reconciliation-blocked",
      `❌ Deployment blocked: ${blocked.lastFailure?.message}`,
    );
    return new Result({
      id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
      success: false,
      executed: true,
      steps: [message],
      errors: [semanticError ?? new ApplicationError("workflow.failed", message, { retryable })],
    });
  }

  async publishDashboard(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<void> {
    const marker = deploymentDashboardMarker(operation.operationId, context.singleAction.issue);
    const body = renderDeploymentDashboard(operation, presentationContext(context));
    const current = await this.dependencies.presentation.findDashboard(
      context.owner,
      context.repo,
      context.singleAction.issue,
      marker,
      context.tokens.token,
    );
    if (current) {
      await this.dependencies.presentation.updateDashboard(
        context.owner,
        context.repo,
        context.singleAction.issue,
        current.id,
        body,
        context.tokens.token,
      );
      return;
    }
    await this.dependencies.presentation.createDashboard(
      context.owner,
      context.repo,
      context.singleAction.issue,
      body,
      context.tokens.token,
    );
  }

  async publishMilestone(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    name: string,
    body: string,
  ): Promise<void> {
    if (operation.commentMode !== "milestones") return;
    const marker = `<!-- copilot-deployment-milestone operation-id="${operation.operationId}" name="${name}" -->`;
    await this.dependencies.presentation.publishMilestone(
      context.owner,
      context.repo,
      context.singleAction.issue,
      marker,
      body,
      context.tokens.token,
    );
  }

  async createOrReusePullRequest(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    phase: "promotion" | "reconciliation",
    target?: ReconciliationTargetState,
  ): Promise<ManagedPullRequestRecord> {
    const headBranch = target?.syncBranch ?? target?.sourceBranch ?? operation.sourceBranch;
    const baseBranch = target?.targetBranch ?? operation.productionBranch;
    const query = {
      owner: context.owner,
      repository: context.repo,
      operationId: operation.operationId,
      phase,
      issue: context.singleAction.issue,
      headBranch,
      baseBranch,
      token: context.tokens.token,
    } as const;
    const existing = await this.dependencies.pullRequests.findManagedPullRequests(query);
    if (existing.length > 1) {
      throw new ApplicationError(
        "provider.conflict",
        `Multiple managed ${phase} PRs match operation ${operation.operationId}.`,
      );
    }
    if (existing[0]) return existing[0];
    const presentation = presentationContext(context);
    const content = phase === "promotion"
      ? renderPromotionPullRequest(operation, presentation)
      : renderReconciliationPullRequest(operation, requireTarget(target), presentation);
    return await this.dependencies.pullRequests.createManagedPullRequest({ ...query, ...content });
  }

  async configureMergeBehavior(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
    category: "promotion" | "reconciliation",
    targetRole: MergeQueueTargetRole,
  ): Promise<
    | { readonly kind: "configured"; readonly operation: DeploymentOperationSnapshot }
    | { readonly kind: "blocked"; readonly result: Result }
  > {
    const inspection = await this.inspectMergeBehavior(
      context,
      operation,
      pullRequest.baseBranch,
      targetRole,
      pullRequest.headSha,
      pullRequest.number,
    );
    if (inspection.kind === "blocked") {
      return {
        kind: "blocked",
        result: await this.block(context, operation, category, inspection.reason, true),
      };
    }
    const managed: DeploymentOperationSnapshot = {
      ...operation,
      selectedPrMode: inspection.decision.mode,
    };
    await this.persist(context, managed);
    await this.applyMergeBehavior(context, operation, pullRequest, inspection);
    await this.publishDashboard(context, managed);
    return { kind: "configured", operation: managed };
  }

  async inspectMergeBehavior(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    targetBranch: string,
    targetRole: MergeQueueTargetRole,
    candidateHeadSha: string,
    pullRequest?: number,
  ): Promise<
    | {
        readonly kind: "ready";
        readonly capabilities: TargetMergeCapabilities;
        readonly decision: Extract<PullRequestModeDecision, { readonly kind: "mode" }>;
      }
    | { readonly kind: "blocked"; readonly reason: string }
  > {
    const capabilities = await this.dependencies.targetRules.getTargetCapabilities(
      context.owner,
      context.repo,
      targetBranch,
      context.tokens.token,
      { candidateHeadSha, ...(pullRequest === undefined ? {} : { pullRequest }) },
    );
    const decision = selectPullRequestMode(operation.prMode, capabilities);
    if (decision.kind === "unsupported") {
      return this.unsupportedMergeBehavior(context, targetRole, targetBranch, capabilities, decision);
    }
    if (decision.mode === "merge-queue") {
      const readiness = evaluateMergeQueueReadiness({
        queueRequired: capabilities.mergeQueueRequired,
        targetRole,
        targetBranch,
        producers: capabilities.mergeQueueProducers,
        problems: capabilities.mergeQueueObservationProblems,
        attestations: context.deployment.mergeQueueCheckAttestations,
      });
      if (readiness.verdict !== "ready") {
        return {
          kind: "blocked",
          reason: mergeQueueReadinessFailureMessage(readiness, context.locale.issue),
        };
      }
    }
    return { kind: "ready", capabilities, decision };
  }

  async cleanup(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<void> {
    const deleteSource = operation.cleanup === "all" || operation.cleanup === "source-only";
    const deleteSync = operation.cleanup === "all" || operation.cleanup === "sync-only";
    if (deleteSync) await this.cleanupSyncBranches(context, operation);
    if (deleteSource) {
      await this.dependencies.git.deleteBranch(
        context.owner,
        context.repo,
        operation.sourceBranch,
        operation.sourceSha,
        context.tokens.token,
      );
    }
  }

  async recordUnexpectedFailure(context: DeploymentOrchestrationContext, error: unknown): Promise<void> {
    const operation = context.currentConfiguration.deploymentOrchestration;
    if (!operation || operation.phase === "completed" || operation.phase === "blocked") return;
    const message = sanitizePublishedError(error instanceof Error ? error.message : String(error));
    const category = failureCategory(operation);
    const blocked = blockDeploymentOperation(operation, category, message, true);
    context.currentConfiguration.deploymentOrchestration = blocked;
    try {
      await this.stateBoundary.persist(context);
      await this.publishDashboard(context, blocked);
    } catch {
      // Preserve the original provider failure returned by the coordinator.
    }
  }

  private async applyMergeBehavior(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
    inspection: {
      readonly capabilities: TargetMergeCapabilities;
      readonly decision: Extract<PullRequestModeDecision, { readonly kind: "mode" }>;
    },
  ): Promise<void> {
    if (inspection.decision.mode === "auto-merge") {
      await this.applyAutoMerge(context, operation, pullRequest, inspection.capabilities);
      return;
    }
    if (inspection.decision.mode === "merge-queue") {
      const queued = await this.dependencies.pullRequests.isPullRequestQueued(
        context.owner,
        context.repo,
        pullRequest.nodeId,
        context.tokens.token,
      );
      if (!queued) {
        await this.dependencies.pullRequests.enqueuePullRequest(
          context.owner,
          context.repo,
          pullRequest.nodeId,
          pullRequest.headSha,
          context.tokens.token,
        );
      }
    }
  }

  private async applyAutoMerge(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
    capabilities: TargetMergeCapabilities,
  ): Promise<void> {
    if (operation.prMode === "auto" && capabilities.immediatelyMergeable) {
      await this.dependencies.pullRequests.mergePullRequest(
        context.owner,
        context.repo,
        pullRequest.number,
        context.tokens.token,
      );
      return;
    }
    if (!pullRequest.autoMergeEnabled) {
      await this.dependencies.pullRequests.enableAutoMerge(
        context.owner,
        context.repo,
        pullRequest.nodeId,
        context.tokens.token,
      );
    }
  }

  private unsupportedMergeBehavior(
    context: DeploymentOrchestrationContext,
    targetRole: MergeQueueTargetRole,
    targetBranch: string,
    capabilities: TargetMergeCapabilities,
    decision: Extract<PullRequestModeDecision, { readonly kind: "unsupported" }>,
  ): { readonly kind: "blocked"; readonly reason: string } {
    if (capabilities.mergeQueueObservationProblems.length === 0) {
      return { kind: "blocked", reason: decision.reason };
    }
    const readiness = evaluateMergeQueueReadiness({
      queueRequired: true,
      targetRole,
      targetBranch,
      producers: capabilities.mergeQueueProducers,
      problems: capabilities.mergeQueueObservationProblems,
      attestations: context.deployment.mergeQueueCheckAttestations,
    });
    return {
      kind: "blocked",
      reason: mergeQueueReadinessFailureMessage(readiness, context.locale.issue),
    };
  }

  private async cleanupSyncBranches(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<void> {
    for (const target of operation.reconciliationTargets) {
      if (!target.syncBranch) continue;
      if (!target.syncSha) {
        throw new ApplicationError(
          "workflow.stale",
          `Sync branch ${target.syncBranch} has no verified cleanup SHA.`,
        );
      }
      await this.dependencies.git.deleteBranch(
        context.owner,
        context.repo,
        target.syncBranch,
        target.syncSha,
        context.tokens.token,
      );
    }
  }
}

export function requireDeploymentOperation(
  context: DeploymentOrchestrationContext,
): DeploymentOperationSnapshot {
  const operation = context.currentConfiguration.deploymentOrchestration;
  if (!operation) throw new ApplicationError("workflow.stale", "No durable deployment operation exists.");
  if (context.singleAction.operationId && context.singleAction.operationId !== operation.operationId) {
    throw new ApplicationError(
      "workflow.stale",
      `Operation ${context.singleAction.operationId} does not match durable operation ${operation.operationId}.`,
    );
  }
  return operation;
}

export function deploymentKind(context: DeploymentOrchestrationContext): "release" | "hotfix" {
  if (context.labels.isRelease === context.labels.isHotfix) {
    throw new ApplicationError("validation.invalid-input", "Exactly one release or hotfix label is required.");
  }
  return context.labels.isRelease ? "release" : "hotfix";
}

export function reconciliationTargetRole(
  operation: DeploymentOperationSnapshot,
  targetBranch: string,
): MergeQueueTargetRole {
  if (targetBranch === operation.productionBranch) return "production";
  if (targetBranch === operation.developmentBranch) return "development";
  return "active-release";
}

export function replaceReconciliationTarget(
  operation: DeploymentOperationSnapshot,
  index: number,
  target: ReconciliationTargetState,
): DeploymentOperationSnapshot {
  return {
    ...operation,
    reconciliationTargets: operation.reconciliationTargets.map((current, currentIndex) =>
      currentIndex === index ? target : current),
  };
}

export function deploymentSuccess(step: string): Result {
  return new Result({
    id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
    success: true,
    executed: true,
    steps: [step],
  });
}

export function blockedDeploymentResult(
  operation: DeploymentOperationSnapshot,
  fallback: string,
): Result {
  const message = operation.lastFailure?.message ?? fallback;
  return new Result({
    id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
    success: false,
    executed: true,
    steps: [message],
    errors: [new ApplicationError("workflow.failed", message, {
      retryable: operation.lastFailure?.retryable ?? false,
    })],
  });
}

export function shouldRecordUnexpectedFailure(error: unknown): boolean {
  return !(error instanceof ApplicationError
    && ["workflow.stale", "workflow.invalid-event", "validation.invalid-input", "authorization.denied"]
      .includes(error.code));
}

export function semanticCleanupError(error: unknown): ApplicationError {
  return toApplicationError(error, "workflow.failed", "Deployment cleanup failed.");
}

function presentationContext(context: DeploymentOrchestrationContext): DeploymentPresentationContext {
  return {
    owner: context.owner,
    repository: context.repo,
    issue: context.singleAction.issue,
    issueLocale: context.locale.issue,
    pullRequestLocale: context.locale.pullRequest,
    packageName: context.owner === "vypdev" && context.repo === "copilot" ? "@vypdev/copilot" : undefined,
  };
}

function requireTarget(target: ReconciliationTargetState | undefined): ReconciliationTargetState {
  if (!target) throw new ApplicationError("workflow.stale", "Reconciliation target is missing.");
  return target;
}

function failureCategory(
  operation: DeploymentOperationSnapshot,
): "promotion" | "publication" | "reconciliation" {
  if (operation.phase === "preparing" || operation.phase === "promotion_pr_pending") return "promotion";
  if (operation.phase === "promoted" || operation.phase === "publishing") return "publication";
  return "reconciliation";
}
