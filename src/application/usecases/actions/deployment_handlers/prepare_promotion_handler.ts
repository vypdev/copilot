import { ApplicationError } from "../../../errors/application_error";
import type { DeploymentOrchestrationContext } from "../../../ports/deployment_orchestration_ports";
import {
  buildInitialDeploymentOperation,
  validateInitialDeploymentInput,
} from "../../../policies/deployment_plan_policy";
import {
  resumeBlockedDeployment,
  transitionDeploymentOperation,
  type DeploymentOperationSnapshot,
} from "../../../../domain/deployment_operation";
import type { Result } from "../../../../data/model/result";
import {
  DeploymentOrchestrationRuntime,
  blockedDeploymentResult,
  deploymentKind,
  deploymentSuccess,
} from "../../../services/deployment_orchestration_runtime";
import { AcceptPromotionHandler } from "./accept_promotion_handler";

export class PreparePromotionHandler {
  constructor(
    private readonly runtime: DeploymentOrchestrationRuntime,
    private readonly acceptPromotion: AcceptPromotionHandler,
  ) {}

  async invoke(context: DeploymentOrchestrationContext): Promise<Result> {
    const existing = context.currentConfiguration.deploymentOrchestration;
    if (existing) return await this.resume(context, existing);
    const operation = await this.createOperation(context);
    await this.runtime.persist(context, operation);
    await this.runtime.publishDashboard(context, operation);
    return await this.ensurePromotion(context, operation);
  }

  private async resume(
    context: DeploymentOrchestrationContext,
    existing: DeploymentOperationSnapshot,
  ): Promise<Result> {
    if (existing.version !== context.singleAction.version) {
      throw new ApplicationError(
        "workflow.stale",
        `Issue already owns deployment operation ${existing.operationId} for version ${existing.version}.`,
      );
    }
    if (isBlockedOutsidePreparation(existing)) {
      await this.runtime.publishDashboard(context, existing);
      return blockedDeploymentResult(existing, "The prepare mode cannot resume this blocked deployment phase.");
    }
    const operation = await this.resumeBlockedPreparation(context, existing);
    if (operation.phase === "preparing" || operation.phase === "promotion_pr_pending") {
      const currentSourceSha = await this.runtime.dependencies.git.getBranchSha(
        context.owner,
        context.repo,
        operation.sourceBranch,
        context.tokens.token,
      );
      if (currentSourceSha !== operation.sourceSha) {
        return await this.runtime.block(
          context,
          operation,
          "promotion",
          "The prepared source branch changed after its immutable SHA was stored.",
          false,
        );
      }
      return await this.ensurePromotion(context, operation);
    }
    await this.runtime.publishDashboard(context, operation);
    return deploymentSuccess(
      `Deployment ${operation.operationId} is already ${operation.phase}; reused its durable state.`,
    );
  }

  private async resumeBlockedPreparation(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<DeploymentOperationSnapshot> {
    if (operation.phase !== "blocked") return operation;
    const resumed = resumeBlockedDeployment(operation);
    if (resumed.kind !== "advance") return operation;
    await this.runtime.persist(context, resumed.operation);
    return resumed.operation;
  }

  private async createOperation(
    context: DeploymentOrchestrationContext,
  ): Promise<DeploymentOperationSnapshot> {
    const kind = deploymentKind(context);
    const sourceBranch = kind === "release"
      ? context.currentConfiguration.releaseBranch
      : context.currentConfiguration.hotfixBranch;
    if (!sourceBranch) {
      throw new ApplicationError("workflow.stale", `No prepared ${kind} branch is stored on the launcher issue.`);
    }
    const sourceSha = await this.runtime.dependencies.git.getBranchSha(
      context.owner,
      context.repo,
      sourceBranch,
      context.tokens.token,
    );
    const originBranch = selectOriginBranch(context, kind);
    const persistedOrigin = kind === "release"
      ? context.currentConfiguration.releaseOriginSha
      : context.currentConfiguration.hotfixOriginSha;
    const originSha = persistedOrigin ?? await this.runtime.dependencies.git.getMergeBaseSha(
      context.owner,
      context.repo,
      originBranch,
      sourceBranch,
      context.tokens.token,
    );
    const operation = buildInitialDeploymentOperation({
      operationId: this.runtime.dependencies.operationId(),
      kind,
      version: context.singleAction.version,
      title: context.singleAction.title,
      changelog: context.singleAction.changelog,
      sourceBranch,
      sourceSha,
      originBranch,
      originSha,
      productionBranch: context.branches.defaultBranch,
      developmentBranch: context.branches.development,
      configuration: context.deployment,
      publicationWorkflow: kind === "release" ? context.workflows.release : context.workflows.hotfix,
    });
    validateOperation(context, operation);
    persistOriginMetadata(context, operation);
    return operation;
  }

  private async ensurePromotion(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<Result> {
    const preflight = await this.runtime.inspectMergeBehavior(
      context,
      operation,
      operation.productionBranch,
      "production",
      operation.sourceSha,
    );
    if (preflight.kind === "blocked") {
      return await this.runtime.block(context, operation, "promotion", preflight.reason, true);
    }
    const promotion = await this.runtime.createOrReusePullRequest(context, operation, "promotion");
    if (promotion.merged) return await this.acceptPromotion.invoke(context, operation, promotion);
    if (promotion.state === "closed") {
      return await this.runtime.block(
        context,
        operation,
        "promotion",
        `Promotion PR #${promotion.number} was closed without merge.`,
        true,
      );
    }
    if (promotion.headSha !== operation.sourceSha) {
      return await this.runtime.block(
        context,
        operation,
        "promotion",
        `Promotion PR #${promotion.number} does not contain the persisted prepared SHA.`,
        false,
      );
    }
    const pending = pendingPromotion(operation, promotion.number);
    await this.runtime.persist(context, pending);
    const configured = await this.runtime.configureMergeBehavior(
      context,
      pending,
      promotion,
      "promotion",
      "production",
    );
    if (configured.kind === "blocked") return configured.result;
    return deploymentSuccess(configured.operation.selectedPrMode === "create-only"
      ? `Promotion PR #${promotion.number} is ready for maintainer review; this runner does not wait.`
      : `Promotion PR #${promotion.number} is managed by GitHub; this runner does not wait for checks.`);
  }
}

function isBlockedOutsidePreparation(operation: DeploymentOperationSnapshot): boolean {
  return operation.phase === "blocked"
    && (!operation.lastFailure?.retryable
      || !["preparing", "promotion_pr_pending"].includes(operation.lastFailure.previousPhase));
}

function selectOriginBranch(
  context: DeploymentOrchestrationContext,
  kind: "release" | "hotfix",
): string {
  return kind === "release"
    ? context.currentConfiguration.releaseOriginBranch ?? context.branches.development
    : context.currentConfiguration.hotfixOriginBranch
      ?? context.currentConfiguration.parentBranch
      ?? context.branches.defaultBranch;
}

function validateOperation(
  context: DeploymentOrchestrationContext,
  operation: DeploymentOperationSnapshot,
): void {
  const errors = validateInitialDeploymentInput({
    operationId: operation.operationId,
    kind: operation.kind,
    version: operation.version,
    title: operation.title,
    changelog: operation.changelog,
    sourceBranch: operation.sourceBranch,
    sourceSha: operation.sourceSha,
    originBranch: operation.originBranch,
    originSha: operation.originSha,
    productionBranch: operation.productionBranch,
    developmentBranch: operation.developmentBranch,
    configuration: context.deployment,
    publicationWorkflow: operation.publicationWorkflow,
  });
  if (errors.length > 0) {
    throw new ApplicationError("validation.invalid-input", errors.join(" "));
  }
}

function persistOriginMetadata(
  context: DeploymentOrchestrationContext,
  operation: DeploymentOperationSnapshot,
): void {
  if (operation.kind === "release") {
    context.currentConfiguration.releaseOriginBranch = operation.originBranch;
    context.currentConfiguration.releaseOriginSha = operation.originSha;
    return;
  }
  context.currentConfiguration.hotfixOriginSha = operation.originSha;
}

function pendingPromotion(
  operation: DeploymentOperationSnapshot,
  pullRequest: number,
): DeploymentOperationSnapshot {
  if (operation.phase === "promotion_pr_pending") return { ...operation, promotionPullRequest: pullRequest };
  const transition = transitionDeploymentOperation(
    { ...operation, promotionPullRequest: pullRequest },
    "preparing",
    "promotion_pr_pending",
  );
  if (transition.operation.phase !== "promotion_pr_pending") {
    throw new ApplicationError("workflow.stale", `Cannot prepare promotion from ${operation.phase}.`);
  }
  return transition.operation;
}
