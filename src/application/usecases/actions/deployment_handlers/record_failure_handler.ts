import { ApplicationError } from "../../../errors/application_error";
import type { DeploymentOrchestrationContext } from "../../../ports/deployment_orchestration_ports";
import { Result } from "../../../../data/model/result";
import { requiredDeploymentFailure } from '../../../../domain/deployment_operation';
import {
  DEPLOYMENT_ORCHESTRATION_TASK_ID,
  DeploymentOrchestrationRuntime,
  deploymentSuccess,
  requireDeploymentOperation,
} from "../../../services/deployment_orchestration_runtime";

export class RecordFailureHandler {
  constructor(private readonly runtime: DeploymentOrchestrationRuntime) {}

  async invoke(context: DeploymentOrchestrationContext): Promise<Result> {
    const operation = requireDeploymentOperation(context);
    if (operation.phase === "completed") {
      return deploymentSuccess(
        `Deployment ${operation.operationId} is already complete; a stale failure report was ignored.`,
      );
    }
    if (operation.phase === "blocked") {
      const failure = requiredDeploymentFailure(operation);
      await this.runtime.publishDashboard(context, operation);
      return new Result({
        id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
        success: false,
        executed: true,
        steps: [`Deployment ${operation.operationId} remains blocked; its original failure classification was preserved.`],
        errors: [new ApplicationError(
          "workflow.failed",
          failure.message,
          { retryable: failure.retryable },
        )],
      });
    }
    const category = failureCategory(operation.phase);
    const message = context.singleAction.message
      || `The ${category} workflow failed. Review the linked workflow run before retrying.`;
    return await this.runtime.block(context, operation, category, message, true);
  }
}

function failureCategory(
  phase: string,
): "promotion" | "publication" | "reconciliation" | "cleanup" {
  if (phase === "preparing" || phase === "promotion_pr_pending") return "promotion";
  if (phase === "promoted" || phase === "publishing") return "publication";
  return "reconciliation";
}
