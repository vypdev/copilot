import { ApplicationError } from "../../../errors/application_error";
import type { DeploymentOrchestrationContext } from "../../../ports/deployment_orchestration_ports";
import {
  buildReconciliationTarget,
  selectReconciliationTargetBranches,
} from "../../../policies/deployment_plan_policy";
import {
  resumeBlockedDeployment,
  type DeploymentOperationSnapshot,
} from "../../../../domain/deployment_operation";
import type { Result } from "../../../../data/model/result";
import {
  DeploymentOrchestrationRuntime,
  deploymentSuccess,
  requireDeploymentOperation,
} from "../../../services/deployment_orchestration_runtime";
import { ReconciliationHandler } from "./reconciliation_handler";

export class ConfirmPublicationHandler {
  constructor(
    private readonly runtime: DeploymentOrchestrationRuntime,
    private readonly reconciliation: ReconciliationHandler,
  ) {}

  async invoke(context: DeploymentOrchestrationContext): Promise<Result> {
    const operation = await this.resumeRetryableBlock(context, requireDeploymentOperation(context));
    if (operation.phase === "reconciliation_pending" && operation.publicationVerified) {
      return await this.reconciliation.plan(context, operation)
        ?? deploymentSuccess(`Publication for ${operation.tag} was already verified; reconciliation state was recovered.`);
    }
    if (operation.phase === "completed" && operation.publicationVerified) {
      await this.runtime.publishDashboard(context, operation);
      return deploymentSuccess(`Publication for ${operation.tag} was already verified; duplicate notification ignored.`);
    }
    assertPublicationPhase(operation);
    const productionSha = requireProductionSha(operation);
    const publication = await this.runtime.dependencies.publication.inspect({
      owner: context.owner,
      repository: context.repo,
      tag: operation.tag,
      productionSha,
      operationId: operation.operationId,
      token: context.tokens.token,
    });
    if (publication.kind === "absent") {
      return await this.runtime.block(
        context,
        operation,
        "publication",
        `The ${publication.effect} publication receipt is absent; rerun the serialized publication phase.`,
        true,
      );
    }
    if (publication.kind === "conflict") {
      return await this.runtime.block(context, operation, "publication", publication.reason, false);
    }
    const reachable = await this.runtime.dependencies.git.isCommitReachable(
      context.owner,
      context.repo,
      operation.productionBranch,
      productionSha,
      context.tokens.token,
    );
    if (!reachable) {
      return await this.runtime.block(
        context,
        operation,
        "publication",
        "Published SHA is not reachable from the stored production branch.",
        false,
      );
    }
    const published: DeploymentOperationSnapshot = {
      ...operation,
      phase: "published",
      publicationVerified: true,
      publicationReceipt: publication.receipt,
      lastFailure: null,
    };
    await this.runtime.persist(context, published);
    await this.runtime.publishMilestone(
      context,
      published,
      "publication-complete",
      `📦 ${published.tag} is published from accepted production SHA \`${published.productionSha}\`.`,
    );
    return await this.beginReconciliation(context, published);
  }

  private async resumeRetryableBlock(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<DeploymentOperationSnapshot> {
    if (operation.phase !== "blocked" || !operation.lastFailure?.retryable) return operation;
    const resumed = resumeBlockedDeployment(operation);
    if (resumed.kind !== "advance") return operation;
    await this.runtime.persist(context, resumed.operation);
    return resumed.operation;
  }

  private async beginReconciliation(
    context: DeploymentOrchestrationContext,
    published: DeploymentOperationSnapshot,
  ): Promise<Result> {
    const activeReleases = published.kind === "hotfix"
      ? (await this.runtime.dependencies.git.listBranches(
          context.owner,
          context.repo,
          context.branches.releaseTree,
          context.tokens.token,
        )).filter((branch) => branch !== published.sourceBranch)
      : [];
    const decision = selectReconciliationTargetBranches(published, activeReleases);
    if (decision.kind === "blocked") {
      return await this.runtime.block(context, published, "reconciliation", decision.reason, false);
    }
    if (decision.kind === "manual") {
      await this.runtime.publishDashboard(context, published);
      return deploymentSuccess(
        `${published.tag} is published. Manual reconciliation is configured, so the issue remains open.`,
      );
    }
    const reconciling: DeploymentOperationSnapshot = {
      ...published,
      reconciliationTargets: decision.targetBranches.map((target) =>
        buildReconciliationTarget(published, target, "direct")),
      phase: "reconciliation_pending",
    };
    await this.runtime.persist(context, reconciling);
    return await this.reconciliation.plan(context, reconciling)
      ?? deploymentSuccess(`${reconciling.tag} is published; development reconciliation is now managed by GitHub.`);
  }
}

function assertPublicationPhase(operation: DeploymentOperationSnapshot): void {
  if (["published", "publishing", "promoted"].includes(operation.phase)) return;
  throw new ApplicationError("workflow.stale", `Publication cannot advance from phase ${operation.phase}.`);
}

function requireProductionSha(operation: DeploymentOperationSnapshot): string {
  if (!operation.productionSha) {
    throw new ApplicationError("workflow.stale", "The accepted production SHA is missing.");
  }
  return operation.productionSha;
}
