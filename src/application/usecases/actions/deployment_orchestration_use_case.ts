import { toApplicationError } from "../../errors/application_error";
import type { DeploymentOrchestrationContext } from "../../ports/deployment_orchestration_ports";
import type { DeploymentOrchestrationDependencies } from "../../services/deployment_orchestration_dependencies";
import {
  DEPLOYMENT_ORCHESTRATION_TASK_ID,
  DeploymentOrchestrationRuntime,
  deploymentSuccess,
  shouldRecordUnexpectedFailure,
} from "../../services/deployment_orchestration_runtime";
import {
  DeploymentStateBoundary,
  SupersededDeploymentInvocationError,
} from "../../services/deployment_state_boundary";
import { Result } from "../../../data/model/result";
import type { ParamUseCase } from "../base/param_usecase";
import { AcceptPromotionHandler } from "./deployment_handlers/accept_promotion_handler";
import { ConfirmPublicationHandler } from "./deployment_handlers/confirm_publication_handler";
import { ContinueDeploymentHandler } from "./deployment_handlers/continue_deployment_handler";
import { PreparePromotionHandler } from "./deployment_handlers/prepare_promotion_handler";
import { ReconciliationHandler } from "./deployment_handlers/reconciliation_handler";
import { RecordFailureHandler } from "./deployment_handlers/record_failure_handler";

export class DeploymentOrchestrationUseCase implements ParamUseCase<DeploymentOrchestrationContext, Result[]> {
  readonly taskId = DEPLOYMENT_ORCHESTRATION_TASK_ID;
  private readonly stateBoundary: DeploymentStateBoundary;
  private readonly runtime: DeploymentOrchestrationRuntime;
  private readonly preparePromotion: PreparePromotionHandler;
  private readonly continueDeployment: ContinueDeploymentHandler;
  private readonly confirmPublication: ConfirmPublicationHandler;
  private readonly recordFailure: RecordFailureHandler;

  constructor(dependencies: DeploymentOrchestrationDependencies) {
    this.stateBoundary = new DeploymentStateBoundary(dependencies.state, dependencies.labels);
    this.runtime = new DeploymentOrchestrationRuntime(dependencies, this.stateBoundary);
    const acceptPromotion = new AcceptPromotionHandler(this.runtime);
    const reconciliation = new ReconciliationHandler(this.runtime);
    this.preparePromotion = new PreparePromotionHandler(this.runtime, acceptPromotion);
    this.continueDeployment = new ContinueDeploymentHandler(this.runtime, acceptPromotion, reconciliation);
    this.confirmPublication = new ConfirmPublicationHandler(this.runtime, reconciliation);
    this.recordFailure = new RecordFailureHandler(this.runtime);
  }

  async invoke(context: DeploymentOrchestrationContext): Promise<Result[]> {
    try {
      await this.stateBoundary.initialize(context);
      const result = await this.invokeSelectedHandler(context);
      return result ? [result] : [];
    } catch (error) {
      return await this.handleFailure(context, error);
    }
  }

  private async invokeSelectedHandler(
    context: DeploymentOrchestrationContext,
  ): Promise<Result | undefined> {
    if (context.singleAction.isPrepareDeploymentAction) return await this.preparePromotion.invoke(context);
    if (context.singleAction.isContinueDeploymentAction) return await this.continueDeployment.invoke(context);
    if (context.singleAction.isPublishedDeploymentAction) return await this.confirmPublication.invoke(context);
    if (context.singleAction.isFailedDeploymentAction) return await this.recordFailure.invoke(context);
    return undefined;
  }

  private async handleFailure(
    context: DeploymentOrchestrationContext,
    error: unknown,
  ): Promise<Result[]> {
    if (error instanceof SupersededDeploymentInvocationError) {
      context.currentConfiguration.deploymentOrchestration = error.current;
      await this.runtime.publishDashboard(context, error.current).catch(() => undefined);
      return [deploymentSuccess(
        `Deployment invocation was superseded by revision ${error.current.revision}; no stale state was written.`,
      )];
    }
    if (shouldRecordUnexpectedFailure(error)) {
      await this.runtime.recordUnexpectedFailure(context, error);
    }
    return [new Result({
      id: DEPLOYMENT_ORCHESTRATION_TASK_ID,
      success: false,
      executed: true,
      steps: ["Deployment orchestration is blocked. No unsafe transition was performed."],
      errors: [toApplicationError(error, "workflow.failed", "Deployment orchestration failed.")],
    })];
  }
}

export type { DeploymentOrchestrationDependencies } from "../../services/deployment_orchestration_dependencies";
