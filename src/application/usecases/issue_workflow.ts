import type { Execution } from "../../data/model/execution";
import { getResultPayload, Result } from "../../data/model/result";
import { logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { buildCopilotWelcomeResult, COPILOT_WELCOME_MARKER } from '../policies/copilot_interaction_policy';

export interface IssueWorkflowPorts {
  recommendStepsUseCase: ParamUseCase<Execution, Result[]>;
  answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>;
  workflowSteps: IssueWorkflowSteps;
}

/** Coordinates issue lifecycle steps in their required sequential order. */
export async function runIssueWorkflow(
  param: Execution,
  taskId: string,
  ports: IssueWorkflowPorts,
): Promise<Result[]> {
  const results: Result[] = [];
  const permissionResult = await ports.workflowSteps.checkPermissions.invoke(param);
  const lastAction = permissionResult[permissionResult.length - 1];
  if (!lastAction) {
    const permissionError = new Error("Permission check returned no result.");
    logError(`Unable to continue ${taskId}: ${permissionError.message}`);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Unable to verify whether the issue action is authorized."],
        errors: [permissionError],
      }),
    ];
  }

  if (!lastAction.success && lastAction.executed) {
    results.push(...permissionResult);
    results.push(...(await ports.workflowSteps.closeNotAllowedIssue.invoke(param)));
    return results;
  }

  if (param.cleanIssueBranches) {
    results.push(...(await ports.workflowSteps.removeIssueBranches.invoke(param)));
  }

  const regularSteps: Array<ParamUseCase<Execution, Result[]>> = [
    ports.workflowSteps.assignMemberToIssue,
    ports.workflowSteps.updateTitle,
    ports.workflowSteps.updateIssueType,
    ports.workflowSteps.linkIssueProject,
    ports.workflowSteps.checkPriorityIssueSize,
    param.isBranched
      ? ports.workflowSteps.prepareBranches
      : ports.workflowSteps.removeIssueBranches,
    ports.workflowSteps.removeNotNeededBranches,
    ports.workflowSteps.deployAdded,
    ports.workflowSteps.deployedAdded,
  ];
  for (const step of regularSteps) {
    results.push(...(await step.invoke(param)));
  }

  const recommendation = resolveIssueRecommendation(param, ports);
  if (recommendation) {
    const recommendationResults = await recommendation.invoke(param);
    results.push(...recommendationResults);
    if (isNewIssue(param) && !containsWelcome(recommendationResults)) {
      results.push(buildCopilotWelcomeResult(param.tokenUser));
    }
  } else if (isNewIssue(param)) {
    results.push(buildCopilotWelcomeResult(param.tokenUser));
  }
  return results;
}

function containsWelcome(results: readonly Result[]): boolean {
  return results.some((result) =>
    result.steps.some((step) => step.includes(COPILOT_WELCOME_MARKER))
    || getResultPayload(result.payload)?.welcomePublished === true,
  );
}

function isNewIssue(param: Execution): boolean {
  return param.eventName === 'issues' && param.inputs?.action === 'opened';
}

function resolveIssueRecommendation(
  param: Execution,
  ports: IssueWorkflowPorts,
): ParamUseCase<Execution, Result[]> | undefined {
  if (!param.issue.opened && !param.issue.descriptionEdited) return undefined;
  if (param.labels.isQuestion || param.labels.isHelp) return ports.answerIssueHelpUseCase;
  if (param.labels.isRelease) return undefined;
  return ports.recommendStepsUseCase;
}
