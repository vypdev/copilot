import type {
  DeploymentOrchestrationContext,
  ManagedPullRequestRecord,
} from "../../../ports/deployment_orchestration_ports";
import type { DeploymentOperationSnapshot } from "../../../../domain/deployment_operation";
import type { Result } from "../../../../data/model/result";
import {
  DeploymentOrchestrationRuntime,
  deploymentSuccess,
} from "../../../services/deployment_orchestration_runtime";

export class AcceptPromotionHandler {
  constructor(private readonly runtime: DeploymentOrchestrationRuntime) {}

  async invoke(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
  ): Promise<Result> {
    if (["promoted", "publishing", "published", "reconciliation_pending", "completed"].includes(operation.phase)) {
      return deploymentSuccess(
        `Duplicate promotion event for PR #${pullRequest.number} was ignored; operation is ${operation.phase}.`,
      );
    }
    if (operation.phase !== "promotion_pr_pending" && operation.phase !== "preparing") {
      return deploymentSuccess(`Out-of-order promotion event was ignored while operation is ${operation.phase}.`);
    }
    if (!matchesPromotion(operation, pullRequest)) {
      return await this.runtime.block(
        context,
        operation,
        "promotion",
        "Promotion PR branches or prepared SHA do not match durable state.",
        false,
      );
    }
    const productionSha = pullRequest.mergeCommitSha;
    if (!productionSha) {
      return await this.runtime.block(
        context,
        operation,
        "promotion",
        "Merged promotion PR has no production merge SHA.",
        true,
      );
    }
    if (!(await this.isAcceptedProductionReachable(context, operation, productionSha))) {
      return await this.runtime.block(
        context,
        operation,
        "promotion",
        "GitHub does not confirm that the accepted production branch contains the promotion commit.",
        true,
      );
    }
    const promoted: DeploymentOperationSnapshot = {
      ...operation,
      promotionPullRequest: pullRequest.number,
      productionSha,
      phase: "promoted",
      lastFailure: null,
    };
    await this.runtime.persist(context, promoted);
    const publishing: DeploymentOperationSnapshot = { ...promoted, phase: "publishing" };
    await this.runtime.persist(context, publishing);
    await this.runtime.publishDashboard(context, publishing);
    await this.runtime.publishMilestone(
      context,
      publishing,
      "promotion-merged",
      `✅ Promotion PR #${pullRequest.number} merged. Publication is starting from production SHA \`${productionSha}\`.`,
    );
    await this.runtime.dependencies.continuation.dispatch(
      context.owner,
      context.repo,
      operation.publicationWorkflow,
      operation.productionBranch,
      operation.operationId,
      context.singleAction.issue,
      operation.version,
      context.tokens.token,
    );
    return deploymentSuccess(
      `Promotion PR #${pullRequest.number} was verified; publication continuation was dispatched from ${operation.productionBranch}.`,
    );
  }

  private async isAcceptedProductionReachable(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    productionSha: string,
  ): Promise<boolean> {
    const [mergeReachable, sourceReachable] = await Promise.all([
      this.runtime.dependencies.git.isCommitReachable(
        context.owner,
        context.repo,
        operation.productionBranch,
        productionSha,
        context.tokens.token,
      ),
      this.runtime.dependencies.git.isCommitReachable(
        context.owner,
        context.repo,
        operation.productionBranch,
        operation.sourceSha,
        context.tokens.token,
      ),
    ]);
    return mergeReachable && sourceReachable;
  }
}

function matchesPromotion(
  operation: DeploymentOperationSnapshot,
  pullRequest: ManagedPullRequestRecord,
): boolean {
  return pullRequest.headBranch === operation.sourceBranch
    && pullRequest.baseBranch === operation.productionBranch
    && pullRequest.headSha === operation.sourceSha;
}
