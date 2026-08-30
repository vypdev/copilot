import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";

export interface PullRequestWorkflowPorts {
  updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>;
  workflowSteps: PullRequestWorkflowSteps;
}

/** Coordinates pull-request lifecycle actions while preserving their sequential order. */
export async function runPullRequestWorkflow(
  param: Execution,
  taskId: string,
  ports: PullRequestWorkflowPorts,
): Promise<Result[]> {
  try {
    logPullRequestState(param);
    if (param.pullRequest.isOpened) {
      const steps: Array<ParamUseCase<Execution, Result[]>> = [
        ports.workflowSteps.updateTitle,
        ports.workflowSteps.assignMemberToIssue,
        ports.workflowSteps.assignReviewersToIssue,
        ports.workflowSteps.linkPullRequestProject,
        ports.workflowSteps.linkPullRequestIssue,
        ports.workflowSteps.syncSizeAndProgressLabels,
        ports.workflowSteps.checkPriorityPullRequestSize,
      ];
      const results = await runSteps(param, steps);
      if (param.ai.getAiPullRequestDescription()) {
        results.push(...(await ports.updatePullRequestDescriptionUseCase.invoke(param)));
      }
      return results;
    }

    if (param.pullRequest.isSynchronize) {
      return param.ai.getAiPullRequestDescription()
        ? ports.updatePullRequestDescriptionUseCase.invoke(param)
        : [];
    }

    if (param.pullRequest.isClosed && param.pullRequest.isMerged) {
      return ports.workflowSteps.closeIssueAfterMerging.invoke(param);
    }
  } catch {
    const semanticError = new Error("Unable to process the pull request.");
    logError(semanticError);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Unable to process the pull request."],
        errors: [semanticError],
      }),
    ];
  }
  return [];
}

async function runSteps(
  param: Execution,
  steps: Array<ParamUseCase<Execution, Result[]>>,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const step of steps) results.push(...(await step.invoke(param)));
  return results;
}

function logPullRequestState(param: Execution): void {
  logDebugInfo(`PR action ${param.pullRequest.action}`);
  logDebugInfo(`PR isOpened ${param.pullRequest.isOpened}`);
  logDebugInfo(`PR isMerged ${param.pullRequest.isMerged}`);
  logDebugInfo(`PR isClosed ${param.pullRequest.isClosed}`);
}
