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
import type {
  RecommendStepsContext,
  RecommendStepsOutcome,
  RecommendationStatePatch,
} from './push_single_action_contexts';

export interface IssueWorkflowRouteContext {
  readonly cleanIssueBranches: boolean;
  readonly branched: boolean;
  readonly membersOnly: boolean;
  readonly actor: string;
  readonly newIssue: boolean;
  readonly tokenUser?: string;
  readonly recommendation?: 'answer-help' | 'recommend';
  readonly recommendSteps: RecommendStepsContext;
}

export interface IssueWorkflowOutcome {
  readonly results: readonly Result[];
  readonly branchConfigurationPatch?: BranchConfigurationPatch;
  readonly recommendationStatePatch?: RecommendationStatePatch;
}

export interface IssueSharedStepContexts {
  readonly permissions: CheckPermissionsContext;
  readonly title: UpdateTitleContext;
  readonly projectLink: ProjectContentLinkContext;
  readonly steps: IssueWorkflowStepContexts;
}

export interface IssueWorkflowPorts {
  recommendStepsUseCase: ParamUseCase<RecommendStepsContext, RecommendStepsOutcome>;
  answerIssueHelpUseCase: ParamUseCase<AnswerIssueHelpContext, Result[]>;
  workflowSteps: IssueWorkflowSteps;
  actorAuthorizationPort?: BoundActorAuthorizationPort;
  sharedContexts: IssueSharedStepContexts;
}

/** Coordinates issue lifecycle steps in their required sequential order. */
export async function runIssueWorkflow(
  context: IssueWorkflowRouteContext,
  taskId: string,
  ports: IssueWorkflowPorts,
): Promise<IssueWorkflowOutcome> {
  const results: Result[] = [];
  let branchConfigurationPatch: BranchConfigurationPatch | undefined;
  let recommendationStatePatch: RecommendationStatePatch | undefined;
  const permissionResult = await ports.workflowSteps.checkPermissions.invoke(ports.sharedContexts.permissions);
  const lastAction = permissionResult[permissionResult.length - 1];
  if (!lastAction) {
    const permissionError = new ApplicationError('provider.contract-invalid', "Permission check returned no result.");
    logError(`Unable to continue ${taskId}: ${permissionError.message}`);
    return issueWorkflowOutcome([
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Unable to verify whether the issue action is authorized."],
        errors: [permissionError],
      }),
    ]);
  }

  if (!lastAction.success && lastAction.executed) {
    results.push(...permissionResult);
    results.push(...(await ports.workflowSteps.closeNotAllowedIssue.invoke(ports.sharedContexts.steps.closeNotAllowed)));
    return issueWorkflowOutcome(results);
  }

  if (context.cleanIssueBranches) {
    results.push(...(await ports.workflowSteps.removeIssueBranches.invoke(ports.sharedContexts.steps.removeIssueBranches)));
  }

  results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(ports.sharedContexts.steps.assignment)));
  results.push(...(await ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title)));
  results.push(...(await ports.workflowSteps.updateIssueType.invoke(ports.sharedContexts.steps.issueType)));
  results.push(...(await ports.workflowSteps.linkIssueProject.invoke(ports.sharedContexts.projectLink)));
  results.push(...(await ports.workflowSteps.checkPriorityIssueSize.invoke(ports.sharedContexts.steps.priority)));
  if (context.branched) {
    const outcome = await ports.workflowSteps.prepareBranches.invoke(ports.sharedContexts.steps.prepareBranches);
    branchConfigurationPatch = outcome.configurationPatch;
    results.push(...outcome.results);
  } else {
    results.push(...(await ports.workflowSteps.removeIssueBranches.invoke(ports.sharedContexts.steps.removeIssueBranches)));
  }
  results.push(...(await ports.workflowSteps.removeNotNeededBranches.invoke(ports.sharedContexts.steps.removeObsoleteBranches)));
  results.push(...(await ports.workflowSteps.deployAdded.invoke(ports.sharedContexts.steps.deployAdded)));

  const agentAllowed = !context.membersOnly || Boolean(
    ports.actorAuthorizationPort
    && await ports.actorAuthorizationPort.isActorAllowedToModifyFiles(context.actor),
  );
  const recommendation = agentAllowed ? context.recommendation : undefined;
  if (recommendation) {
    const recommendationOutcome = recommendation === 'answer-help'
      ? { results: await ports.answerIssueHelpUseCase.invoke(ports.sharedContexts.steps.answerHelp) }
      : await ports.recommendStepsUseCase.invoke(context.recommendSteps);
    const recommendationResults = recommendationOutcome.results;
    recommendationStatePatch = 'configurationPatch' in recommendationOutcome
      ? recommendationOutcome.configurationPatch
      : undefined;
    results.push(...recommendationResults);
    if (context.newIssue && !containsWelcome(recommendationResults)) {
      results.push(buildCopilotWelcomeResult(context.tokenUser, ports.sharedContexts.steps.answerHelp.locale));
    }
  } else if (context.newIssue) {
    results.push(buildCopilotWelcomeResult(context.tokenUser, ports.sharedContexts.steps.answerHelp.locale));
  }
  return issueWorkflowOutcome(results, branchConfigurationPatch, recommendationStatePatch);
}

function containsWelcome(results: readonly Result[]): boolean {
  return results.some((result) =>
    result.steps.some((step) => step.includes(COPILOT_WELCOME_MARKER))
    || getResultPayload(result.payload)?.welcomePublished === true,
  );
}

function issueWorkflowOutcome(
  results: readonly Result[],
  branchConfigurationPatch?: BranchConfigurationPatch,
  recommendationStatePatch?: RecommendationStatePatch,
): IssueWorkflowOutcome {
  return Object.freeze({
    results: Object.freeze([...results]),
    ...(branchConfigurationPatch ? { branchConfigurationPatch: Object.freeze({ ...branchConfigurationPatch }) } : {}),
    ...(recommendationStatePatch ? { recommendationStatePatch: Object.freeze({ ...recommendationStatePatch }) } : {}),
  });
}
