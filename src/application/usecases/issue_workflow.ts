import type { Execution } from "../../data/model/execution";
import { getResultPayload, Result } from "../../data/model/result";
import { logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { buildCopilotWelcomeResult, COPILOT_WELCOME_MARKER } from '../policies/copilot_interaction_policy';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import { ApplicationError } from '../errors/application_error';
import type { CheckPermissionsContext } from './steps/common/check_permissions_workflow';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';

export interface IssueSharedStepContexts {
  readonly permissions: CheckPermissionsContext;
  readonly title: UpdateTitleContext;
  readonly projectLink: ProjectContentLinkContext;
}

export interface IssueWorkflowPorts {
  recommendStepsUseCase: ParamUseCase<Execution, Result[]>;
  answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>;
  workflowSteps: IssueWorkflowSteps;
  actorAuthorizationPort?: ActorAuthorizationPort;
  sharedContexts: IssueSharedStepContexts;
}

/** Coordinates issue lifecycle steps in their required sequential order. */
export async function runIssueWorkflow(
  param: Execution,
  taskId: string,
  ports: IssueWorkflowPorts,
): Promise<Result[]> {
  const results: Result[] = [];
  const permissionResult = await ports.workflowSteps.checkPermissions.invoke(ports.sharedContexts.permissions);
  const lastAction = permissionResult[permissionResult.length - 1];
  if (!lastAction) {
    const permissionError = new ApplicationError('provider.contract-invalid', "Permission check returned no result.");
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

  results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(param)));
  results.push(...(await ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title)));
  results.push(...(await ports.workflowSteps.updateIssueType.invoke(param)));
  results.push(...(await ports.workflowSteps.linkIssueProject.invoke(ports.sharedContexts.projectLink)));
  results.push(...(await ports.workflowSteps.checkPriorityIssueSize.invoke(param)));
  results.push(...(await (param.isBranched
    ? ports.workflowSteps.prepareBranches
    : ports.workflowSteps.removeIssueBranches).invoke(param)));
  results.push(...(await ports.workflowSteps.removeNotNeededBranches.invoke(param)));
  results.push(...(await ports.workflowSteps.deployAdded.invoke(param)));

  const membersOnly = param.ai.getAiMembersOnly();
  const agentAllowed = !membersOnly || Boolean(ports.actorAuthorizationPort && await ports.actorAuthorizationPort.isActorAllowedToModifyFiles(
      param.owner,
      param.repo,
      param.actor,
      param.tokens.token,
    ));
  const recommendation = agentAllowed ? resolveIssueRecommendation(param, ports) : undefined;
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
