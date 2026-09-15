import { ApplicationError, toApplicationError } from "../errors/application_error";
import type {
  DeploymentOrchestrationContext,
  ManagedPullRequestRecord,
} from "../ports/deployment_orchestration_ports";
import {
  mergeQueueReadinessFailureMessage,
  pullRequestModeDecisionMessage,
  selectPullRequestMode,
  type PullRequestModeDecision,
  type TargetMergeCapabilities,
} from "../policies/deployment_plan_policy";
import {
  deploymentDashboardMarker,
  renderDeploymentDashboard,
  renderDeploymentMilestone,
  renderPromotionPullRequest,
  renderReconciliationPullRequest,
  type DeploymentMilestone,
  type DeploymentPresentationContext,
} from "../policies/deployment_presentation_policy";
import {
  resolveDeploymentCatalog,
  type DeploymentMessageCatalog,
} from "../policies/deployment_message_catalog";
import {
  blockDeploymentOperation,
  requiredDeploymentFailure,
  sanitizeDeploymentMessage,
  type DeploymentOperationSnapshot,
  type ReconciliationTargetState,
} from "../../domain/deployment_operation";
import {
  evaluateMergeQueueReadiness,
  type MergeQueueTargetRole,
} from "../../domain/merge_queue_readiness";
import { Result } from "../../data/model/result";
import type { DeploymentOrchestrationDependencies } from "./deployment_orchestration_dependencies";
import { DeploymentStateBoundary } from "./deployment_state_boundary";

export const DEPLOYMENT_ORCHESTRATION_TASK_ID = "DeploymentOrchestrationUseCase";

export class DeploymentOrchestrationRuntime {
  private readonly presentationCatalogs = new Map<string, Promise<DeploymentMessageCatalog>>();

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
    const sanitizedMessage = sanitizeDeploymentMessage(message);
    const blocked = blockDeploymentOperation(operation, category, sanitizedMessage, retryable);
    await this.persist(context, blocked);
    await this.publishDashboard(context, blocked);
    await this.publishMilestone(
      context,
      blocked,
      { kind: "reconciliation-blocked", reason: sanitizedMessage },
    );
    return new Result({
      id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
      success: false,
      executed: true,
      steps: [sanitizedMessage],
      errors: [semanticError ?? new ApplicationError("workflow.failed", sanitizedMessage, { retryable })],
    });
  }

  async publishDashboard(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<void> {
    const marker = deploymentDashboardMarker(operation.operationId, context.singleAction.issue);
    const catalog = await this.presentationCatalog("issue", context, operation);
    const body = renderDeploymentDashboard(operation, presentationContext(context, operation), catalog);
    const current = await this.dependencies.presentation.findDashboard(
      context.singleAction.issue,
      marker,
    );
    if (current) {
      await this.dependencies.presentation.updateDashboard(
        context.singleAction.issue,
        current.id,
        body,
      );
      return;
    }
    await this.dependencies.presentation.createDashboard(
      context.singleAction.issue,
      body,
    );
  }

  async publishMilestone(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    milestone: DeploymentMilestone,
  ): Promise<void> {
    if (operation.commentMode !== "milestones") return;
    const marker = `<!-- copilot-deployment-milestone operation-id="${operation.operationId}" name="${milestone.kind}" -->`;
    const catalog = await this.presentationCatalog("issue", context, operation);
    await this.dependencies.presentation.publishMilestone(
      context.singleAction.issue,
      marker,
      renderDeploymentMilestone(milestone, catalog),
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
      operationId: operation.operationId,
      phase,
      issue: context.singleAction.issue,
      headBranch,
      baseBranch,
    } as const;
    const existing = await this.dependencies.pullRequests.findManagedPullRequests(query);
    if (existing.length > 1) {
      throw new ApplicationError(
        "provider.conflict",
        `Multiple managed ${phase} PRs match operation ${operation.operationId}.`,
      );
    }
    if (existing[0]) return existing[0];
    const presentation = presentationContext(context, operation);
    const catalog = await this.presentationCatalog("pull-request", context, operation);
    const content = phase === "promotion"
      ? renderPromotionPullRequest(operation, presentation, catalog)
      : renderReconciliationPullRequest(operation, requireTarget(target), presentation, catalog);
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
      targetBranch,
      { candidateHeadSha, ...(pullRequest === undefined ? {} : { pullRequest }) },
    );
    const decision = selectPullRequestMode(operation.prMode, capabilities);
    if (decision.kind === "unsupported") {
      return this.unsupportedMergeBehavior(context, operation, targetRole, targetBranch, capabilities, decision);
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
        const catalog = await this.presentationCatalog('issue', context, operation);
        return {
          kind: "blocked",
          reason: mergeQueueReadinessFailureMessage(readiness, catalog),
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
        operation.sourceBranch,
        operation.sourceSha,
      );
    }
  }

  async recordUnexpectedFailure(context: DeploymentOrchestrationContext, _error: unknown): Promise<void> {
    const operation = context.currentConfiguration.deploymentOrchestration;
    if (!operation || operation.phase === "completed" || operation.phase === "blocked") return;
    const message = "Deployment orchestration failed unexpectedly.";
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
        pullRequest.nodeId,
      );
      if (!queued) {
        await this.dependencies.pullRequests.enqueuePullRequest(
          pullRequest.nodeId,
          pullRequest.headSha,
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
        pullRequest.number,
      );
      return;
    }
    if (!pullRequest.autoMergeEnabled) {
      await this.dependencies.pullRequests.enableAutoMerge(
        pullRequest.nodeId,
      );
    }
  }

  private async unsupportedMergeBehavior(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    targetRole: MergeQueueTargetRole,
    targetBranch: string,
    capabilities: TargetMergeCapabilities,
    decision: Extract<PullRequestModeDecision, { readonly kind: "unsupported" }>,
  ): Promise<{ readonly kind: "blocked"; readonly reason: string }> {
    const catalog = await this.presentationCatalog('issue', context, operation);
    if (capabilities.mergeQueueObservationProblems.length === 0) {
      return { kind: "blocked", reason: pullRequestModeDecisionMessage(decision, catalog) };
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
      reason: mergeQueueReadinessFailureMessage(readiness, catalog),
    };
  }

  private presentationCatalog(
    scope: "issue" | "pull-request",
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<DeploymentMessageCatalog> {
    const locale = effectiveLocale(context, operation);
    const targetLocale = scope === "issue" ? locale.issue : locale.pullRequest;
    const key = `${scope}:${targetLocale}`;
    const existing = this.presentationCatalogs.get(key);
    if (existing) return existing;
    const resolution = resolveDeploymentCatalog(
      targetLocale,
      context.agentConfiguration,
      this.dependencies.catalogResolver,
    );
    this.presentationCatalogs.set(key, resolution);
    return resolution;
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
        target.syncBranch,
        target.syncSha,
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
): Result {
  const failure = requiredDeploymentFailure(operation);
  const message = failure.message;
  return new Result({
    id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
    success: false,
    executed: true,
    steps: [message],
    errors: [new ApplicationError("workflow.failed", message, {
      retryable: failure.retryable,
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

function presentationContext(
  context: DeploymentOrchestrationContext,
  operation: DeploymentOperationSnapshot,
): DeploymentPresentationContext {
  const locale = effectiveLocale(context, operation);
  return {
    owner: context.owner,
    repository: context.repo,
    issue: context.singleAction.issue,
    repositoryLocale: locale.repository,
    issueLocale: locale.issue,
    pullRequestLocale: locale.pullRequest,
    packageName: context.owner === "vypdev" && context.repo === "copilot" ? "@vypdev/copilot" : undefined,
  };
}

function effectiveLocale(
  _context: DeploymentOrchestrationContext,
  operation: DeploymentOperationSnapshot,
): DeploymentOrchestrationContext["locale"] {
  return operation.locale;
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
