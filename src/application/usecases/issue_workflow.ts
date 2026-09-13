import type { Execution } from "../../data/model/execution";
import { getResultPayload, Result } from "../../data/model/result";
import { logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { buildCopilotWelcomeResult, COPILOT_WELCOME_MARKER } from '../policies/copilot_interaction_policy';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import { ApplicationError } from '../errors/application_error';
import type { CheckPermissionsContext } from './steps/common/check_permissions_workflow';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';
import type {
  AnswerIssueHelpContext,
  BranchConfigurationPatch,
  IssueWorkflowStepContexts,
} from './issue_workflow_context';

export interface IssueSharedStepContexts {
  readonly permissions: CheckPermissionsContext;
  readonly title: UpdateTitleContext;
  readonly projectLink: ProjectContentLinkContext;
  readonly steps: IssueWorkflowStepContexts;
}

export interface IssueWorkflowPorts {
  recommendStepsUseCase: ParamUseCase<Execution, Result[]>;
  answerIssueHelpUseCase: ParamUseCase<AnswerIssueHelpContext, Result[]>;
  workflowSteps: IssueWorkflowSteps;
  actorAuthorizationPort?: BoundActorAuthorizationPort;
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
    results.push(...(await ports.workflowSteps.closeNotAllowedIssue.invoke(ports.sharedContexts.steps.closeNotAllowed)));
    return results;
  }

  if (param.cleanIssueBranches) {
    results.push(...(await ports.workflowSteps.removeIssueBranches.invoke(ports.sharedContexts.steps.removeIssueBranches)));
  }

  results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(ports.sharedContexts.steps.assignment)));
  results.push(...(await ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title)));
  results.push(...(await ports.workflowSteps.updateIssueType.invoke(ports.sharedContexts.steps.issueType)));
  results.push(...(await ports.workflowSteps.linkIssueProject.invoke(ports.sharedContexts.projectLink)));
  results.push(...(await ports.workflowSteps.checkPriorityIssueSize.invoke(ports.sharedContexts.steps.priority)));
  if (param.isBranched) {
    const outcome = await ports.workflowSteps.prepareBranches.invoke(ports.sharedContexts.steps.prepareBranches);
    applyBranchConfigurationPatch(param, outcome.configurationPatch);
    results.push(...outcome.results);
  } else {
    results.push(...(await ports.workflowSteps.removeIssueBranches.invoke(ports.sharedContexts.steps.removeIssueBranches)));
  }
  results.push(...(await ports.workflowSteps.removeNotNeededBranches.invoke(ports.sharedContexts.steps.removeObsoleteBranches)));
  results.push(...(await ports.workflowSteps.deployAdded.invoke(ports.sharedContexts.steps.deployAdded)));

  const membersOnly = param.ai.getAiMembersOnly();
  const agentAllowed = !membersOnly || Boolean(
    ports.actorAuthorizationPort
    && await ports.actorAuthorizationPort.isActorAllowedToModifyFiles(param.actor),
  );
  const recommendation = agentAllowed ? resolveIssueRecommendation(param) : undefined;
  if (recommendation) {
    const recommendationResults = recommendation === 'answer-help'
      ? await ports.answerIssueHelpUseCase.invoke(ports.sharedContexts.steps.answerHelp)
      : await ports.recommendStepsUseCase.invoke(param);
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
): 'answer-help' | 'recommend' | undefined {
  if (!param.issue.opened && !param.issue.descriptionEdited) return undefined;
  if (param.labels.isQuestion || param.labels.isHelp) return 'answer-help';
  if (param.labels.isRelease) return undefined;
  return 'recommend';
}

function applyBranchConfigurationPatch(
  param: Execution,
  patch: BranchConfigurationPatch,
): void {
  if (patch.parentBranch !== undefined) param.currentConfiguration.parentBranch = patch.parentBranch;
  if (patch.workingBranch !== undefined) param.currentConfiguration.workingBranch = patch.workingBranch;
  if (patch.releaseBranch !== undefined) param.currentConfiguration.releaseBranch = patch.releaseBranch;
  if (patch.releaseOriginBranch !== undefined) param.currentConfiguration.releaseOriginBranch = patch.releaseOriginBranch;
  if (patch.releaseOriginSha !== undefined) param.currentConfiguration.releaseOriginSha = patch.releaseOriginSha;
  if (patch.hotfixBranch !== undefined) param.currentConfiguration.hotfixBranch = patch.hotfixBranch;
  if (patch.hotfixOriginSha !== undefined) param.currentConfiguration.hotfixOriginSha = patch.hotfixOriginSha;
}
