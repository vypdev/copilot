import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import { ApplicationError } from '../errors/application_error';

export interface PullRequestWorkflowPorts {
  updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>;
  reviewPotentialProblemsUseCase?: ParamUseCase<Execution, Result[]>;
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
      if (shouldUpdatePullRequestDescriptionAutomatically(param)) {
        results.push(...(await ports.updatePullRequestDescriptionUseCase.invoke(param)));
      }
      results.push(...(await runPullRequestReview(param, ports)));
      return results;
    }

    if (param.pullRequest.isSynchronize) {
      const results = shouldUpdatePullRequestDescriptionAutomatically(param)
        ? await ports.updatePullRequestDescriptionUseCase.invoke(param)
        : [];
      results.push(...(await runPullRequestReview(param, ports)));
      return results;
    }

    if (param.pullRequest.isClosed && param.pullRequest.isMerged) {
      return ports.workflowSteps.closeIssueAfterMerging.invoke(param);
    }
  } catch (cause) {
    const semanticError = new ApplicationError("Unable to process the pull request.", 'workflow', { cause });
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

function shouldUpdatePullRequestDescriptionAutomatically(param: Execution): boolean {
  const mode = param.ai.getPullRequestDescriptionMode?.();
  return mode === undefined
    ? param.ai.getAiPullRequestDescription()
    : mode === 'replace' || mode === 'append';
}

async function runPullRequestReview(
  param: Execution,
  ports: PullRequestWorkflowPorts,
): Promise<Result[]> {
  if (!ports.reviewPotentialProblemsUseCase || !shouldReviewPullRequest(param)) return [];
  return ports.reviewPotentialProblemsUseCase.invoke(param);
}

function shouldReviewPullRequest(param: Execution): boolean {
  return ['opened', 'reopened', 'synchronize', 'edited'].includes(param.pullRequest.action);
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
