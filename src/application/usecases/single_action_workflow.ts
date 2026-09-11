import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logError, logDebugInfo } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";

export interface SingleActionWorkflowPorts {
  publishGithubActionUseCase: ParamUseCase<Execution, Result[]>;
  createReleaseUseCase: ParamUseCase<Execution, Result[]>;
  createTagUseCase: ParamUseCase<Execution, Result[]>;
  thinkUseCase: ParamUseCase<Execution, Result[]>;
  initialSetupUseCase: ParamUseCase<Execution, Result[]>;
  checkProgressUseCase: ParamUseCase<Execution, Result[]>;
  detectPotentialProblemsUseCase: ParamUseCase<Execution, Result[]>;
  recommendStepsUseCase: ParamUseCase<Execution, Result[]>;
  closeInactiveIssuesUseCase?: ParamUseCase<Execution, Result[]>;
  publishIssueCommentUseCase?: ParamUseCase<Execution, Result[]>;
  observeBranchSyncUseCase?: ParamUseCase<Execution, Result[]>;
  deploymentOrchestrationUseCase?: ParamUseCase<Execution, Result[]>;
}

export async function runSingleActionWorkflow(
  param: Execution,
  taskId: string,
  ports: SingleActionWorkflowPorts,
): Promise<Result[]> {
  if (!param.singleAction.validSingleAction) {
    logDebugInfo(
      `Single action is not valid: ${param.singleAction.currentSingleAction}. Skipping.`,
    );
    return [];
  }

  logDebugInfo(`SingleAction: dispatching to handler for action: ${param.singleAction.currentSingleAction}.`);
  const action = [
    { active: param.singleAction.isPublishGithubAction, useCase: ports.publishGithubActionUseCase },
    { active: param.singleAction.isCreateReleaseAction, useCase: ports.createReleaseUseCase },
    { active: param.singleAction.isCreateTagAction, useCase: ports.createTagUseCase },
    { active: param.singleAction.isThinkAction, useCase: ports.thinkUseCase },
    { active: param.singleAction.isInitialSetupAction, useCase: ports.initialSetupUseCase },
    { active: param.singleAction.isCheckProgressAction, useCase: ports.checkProgressUseCase },
    { active: param.singleAction.isDetectPotentialProblemsAction, useCase: ports.detectPotentialProblemsUseCase },
    { active: param.singleAction.isRecommendStepsAction, useCase: ports.recommendStepsUseCase },
    { active: param.singleAction.isCloseInactiveIssuesAction, useCase: ports.closeInactiveIssuesUseCase },
    { active: param.singleAction.isPublishIssueCommentAction, useCase: ports.publishIssueCommentUseCase },
    { active: param.singleAction.isCheckBranchSyncAction, useCase: ports.observeBranchSyncUseCase },
    { active: param.singleAction.isDeploymentOrchestrationAction, useCase: ports.deploymentOrchestrationUseCase },
  ].find(({ active, useCase }) => active && useCase !== undefined);

  if (!action || !action.useCase) return [];

  try {
    return await action.useCase.invoke(param);
  } catch (error) {
    logError(error);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: [`Error executing single action: ${param.singleAction.currentSingleAction}.`],
        errors: [error],
      }),
    ];
  }
}
