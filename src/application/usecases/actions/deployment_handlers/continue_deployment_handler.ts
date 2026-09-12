import { ApplicationError } from "../../../errors/application_error";
import type {
  DeploymentOrchestrationContext,
  ManagedPullRequestRecord,
} from "../../../ports/deployment_orchestration_ports";
import {
  resumeBlockedDeployment,
  type DeploymentOperationSnapshot,
} from "../../../../domain/deployment_operation";
import { parseManagedPullRequestMarker } from "../../../../domain/managed_pull_request";
import type { ManagedPullRequestPhase } from "../../../../domain/deployment_operation";
import type { Result } from "../../../../data/model/result";
import {
  DeploymentOrchestrationRuntime,
  deploymentSuccess,
  requireDeploymentOperation,
} from "../../../services/deployment_orchestration_runtime";
import { AcceptPromotionHandler } from "./accept_promotion_handler";
import { ReconciliationHandler } from "./reconciliation_handler";

export class ContinueDeploymentHandler {
  constructor(
    private readonly runtime: DeploymentOrchestrationRuntime,
    private readonly acceptPromotion: AcceptPromotionHandler,
    private readonly reconciliation: ReconciliationHandler,
  ) {}

  async invoke(context: DeploymentOrchestrationContext): Promise<Result> {
    let operation = requireDeploymentOperation(context);
    const pullRequest = await this.loadPullRequest(context);
    const identity = parseManagedPullRequestMarker(pullRequest.body);
    if (!identity
      || identity.operationId !== operation.operationId
      || identity.issue !== context.singleAction.issue) {
      throw new ApplicationError(
        "workflow.stale",
        `PR #${pullRequest.number} is not owned by deployment operation ${operation.operationId}.`,
      );
    }
    const resumed = await this.resumeBlockedEvent(context, operation, pullRequest, identity.phase);
    if (resumed.kind === "result") return resumed.result;
    operation = resumed.operation;
    assertSameRepository(context, pullRequest);
    if (pullRequest.state !== "closed") {
      return deploymentSuccess(`PR #${pullRequest.number} is still open; no transition was applied.`);
    }
    if (!pullRequest.merged) {
      return await this.runtime.block(
        context,
        operation,
        identity.phase === "promotion" ? "promotion" : "reconciliation",
        `Managed ${identity.phase} PR #${pullRequest.number} was closed without merge.`,
        true,
      );
    }
    return identity.phase === "promotion"
      ? await this.acceptPromotion.invoke(context, operation, pullRequest)
      : await this.reconciliation.accept(context, operation, pullRequest);
  }

  private async loadPullRequest(
    context: DeploymentOrchestrationContext,
  ): Promise<ManagedPullRequestRecord> {
    if (context.pullRequest.number < 1) {
      throw new ApplicationError("workflow.invalid-event", "The continuation event has no pull request number.");
    }
    return await this.runtime.dependencies.pullRequests.getPullRequest(
      context.owner,
      context.repo,
      context.pullRequest.number,
      context.tokens.token,
    );
  }

  private async resumeBlockedEvent(
    context: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
    pullRequest: ManagedPullRequestRecord,
    phase: ManagedPullRequestPhase,
  ): Promise<
    | { readonly kind: "resumed"; readonly operation: DeploymentOperationSnapshot }
    | { readonly kind: "result"; readonly result: Result }
  > {
    if (operation.phase !== "blocked") return { kind: "resumed", operation };
    if (!canResumeEvent(operation, phase)) {
      await this.runtime.publishDashboard(context, operation);
      return {
        kind: "result",
        result: deploymentSuccess(
          `PR #${pullRequest.number} cannot resume the existing ${operation.lastFailure?.category ?? "deployment"} block; the original diagnosis was preserved.`,
        ),
      };
    }
    const resumed = resumeBlockedDeployment(operation);
    if (resumed.kind !== "advance") return { kind: "resumed", operation };
    await this.runtime.persist(context, resumed.operation);
    return { kind: "resumed", operation: resumed.operation };
  }
}

function canResumeEvent(
  operation: DeploymentOperationSnapshot,
  phase: ManagedPullRequestPhase,
): boolean {
  if (operation.lastFailure?.retryable !== true) return false;
  const previousPhase = operation.lastFailure.previousPhase;
  return phase === "promotion"
    ? previousPhase === "preparing" || previousPhase === "promotion_pr_pending"
    : previousPhase === "reconciliation_pending";
}

function assertSameRepository(
  context: DeploymentOrchestrationContext,
  pullRequest: ManagedPullRequestRecord,
): void {
  if (pullRequest.repositoryFullName.toLowerCase() === `${context.owner}/${context.repo}`.toLowerCase()) return;
  throw new ApplicationError("authorization.denied", "Cross-repository deployment continuation was rejected.");
}
