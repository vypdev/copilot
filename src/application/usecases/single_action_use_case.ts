import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo, logWarn } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import { runSingleActionWorkflow } from "./single_action_workflow";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import type { ThinkContext } from './steps/common/think_workflow';
import { projectThinkContext } from './steps/common/think_workflow';
import { projectBugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import type { DeploymentOrchestrationContext } from '../ports/deployment_orchestration_ports';
import {
  projectBranchObservationContext,
  projectDeploymentPublicationContext,
  projectDeploymentOrchestrationContext,
  projectInactivityContext,
  projectInitialSetupContext,
  projectIssueCommentActionContext,
  projectProgressContext,
  projectRecommendStepsContext,
  type BranchObservationContext,
  type DeploymentPublicationContext,
  type InactivityContext,
  type InitialSetupContext,
  type IssueCommentActionContext,
  type ProgressContext,
  type RecommendStepsContext,
  type RecommendStepsOutcome,
} from './push_single_action_contexts';
import type { SingleActionDispatch } from './single_action_workflow';

export class SingleActionUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "SingleActionUseCase";

  constructor(
    private readonly publishGithubActionUseCase: ParamUseCase<DeploymentPublicationContext, Result[]> | undefined,
    private readonly createReleaseUseCase: ParamUseCase<DeploymentPublicationContext, Result[]> | undefined,
    private readonly createTagUseCase: ParamUseCase<DeploymentPublicationContext, Result[]> | undefined,
    private readonly thinkUseCase: ParamUseCase<ThinkContext, Result[]>,
    private readonly initialSetupUseCase: ParamUseCase<InitialSetupContext, Result[]>,
    private readonly checkProgressUseCase: ParamUseCase<ProgressContext, Result[]>,
    private readonly detectPotentialProblemsUseCase: ParamUseCase<BugbotReviewOperationContext, Result[]>,
    private readonly recommendStepsUseCase: ParamUseCase<RecommendStepsContext, RecommendStepsOutcome>,
    private readonly closeInactiveIssuesUseCase?: ParamUseCase<InactivityContext, Result[]>,
    private readonly actorAuthorizationPort?: ActorAuthorizationPort,
    private readonly publishIssueCommentUseCase?: ParamUseCase<IssueCommentActionContext, Result[]>,
    private readonly observeBranchSyncUseCase?: ParamUseCase<BranchObservationContext, Result[]>,
    private readonly deploymentOrchestrationUseCase?: ParamUseCase<DeploymentOrchestrationContext, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    if (!param.singleAction.validSingleAction) {
      logWarn(`Single action invoked but not a valid single action: ${param.singleAction.currentSingleAction}. Skipping.`);
      return [];
    }
    if (isAgentBackedSingleAction(param) && param.ai.getAiMembersOnly()) {
      const allowed = Boolean(this.actorAuthorizationPort && await this.actorAuthorizationPort.isActorAllowedToUseMemberOnlyAutomation(
        param.owner,
        param.repo,
        param.actor,
        param.tokens.token,
      ));
      if (!allowed) {
        logInfo('Skipping agent-backed single action because ai-members-only is enabled and the actor is not authorized.');
        return [];
      }
    }
    const outcome = await runSingleActionWorkflow(projectSingleActionDispatch(param), this.taskId, {
      publishGithubActionUseCase: this.publishGithubActionUseCase,
      createReleaseUseCase: this.createReleaseUseCase,
      createTagUseCase: this.createTagUseCase,
      thinkUseCase: this.thinkUseCase,
      initialSetupUseCase: this.initialSetupUseCase,
      checkProgressUseCase: this.checkProgressUseCase,
      detectPotentialProblemsUseCase: this.detectPotentialProblemsUseCase,
      recommendStepsUseCase: this.recommendStepsUseCase,
      closeInactiveIssuesUseCase: this.closeInactiveIssuesUseCase,
      publishIssueCommentUseCase: this.publishIssueCommentUseCase,
      observeBranchSyncUseCase: this.observeBranchSyncUseCase,
      deploymentOrchestrationUseCase: this.deploymentOrchestrationUseCase,
    });
    if (outcome.configurationPatch) {
      param.currentConfiguration.recommendationState = { ...outcome.configurationPatch.recommendationState };
    }
    return [...outcome.results];
  }
}

function projectSingleActionDispatch(param: Execution): SingleActionDispatch {
  const action = param.singleAction.currentSingleAction;
  if (!param.singleAction.validSingleAction) return Object.freeze({ kind: 'invalid', action });
  if (param.singleAction.isPublishGithubAction) return Object.freeze({ kind: 'publish-github-action', action, input: projectDeploymentPublicationContext(param) });
  if (param.singleAction.isCreateReleaseAction) return Object.freeze({ kind: 'create-release', action, input: projectDeploymentPublicationContext(param) });
  if (param.singleAction.isCreateTagAction) return Object.freeze({ kind: 'create-tag', action, input: projectDeploymentPublicationContext(param) });
  if (param.singleAction.isThinkAction) return Object.freeze({ kind: 'think', action, input: projectThinkContext(param) });
  if (param.singleAction.isInitialSetupAction) return Object.freeze({ kind: 'initial-setup', action, input: projectInitialSetupContext(param) });
  if (param.singleAction.isCheckProgressAction) return Object.freeze({ kind: 'check-progress', action, input: projectProgressContext(param) });
  if (param.singleAction.isDetectPotentialProblemsAction) return Object.freeze({ kind: 'detect-potential-problems', action, input: projectBugbotReviewOperationContext(param) });
  if (param.singleAction.isRecommendStepsAction) return Object.freeze({ kind: 'recommend-steps', action, input: projectRecommendStepsContext(param) });
  if (param.singleAction.isCloseInactiveIssuesAction) return Object.freeze({ kind: 'close-inactive-issues', action, input: projectInactivityContext(param) });
  if (param.singleAction.isPublishIssueCommentAction) return Object.freeze({ kind: 'publish-issue-comment', action, input: projectIssueCommentActionContext(param) });
  if (param.singleAction.isCheckBranchSyncAction) return Object.freeze({ kind: 'observe-branch-sync', action, input: projectBranchObservationContext(param) });
  if (param.singleAction.isDeploymentOrchestrationAction) {
    return Object.freeze({ kind: 'deployment-orchestration', action, input: projectDeploymentOrchestrationContext(param) });
  }
  return Object.freeze({ kind: 'invalid', action });
}

function isAgentBackedSingleAction(param: Execution): boolean {
  return param.singleAction.isThinkAction
    || param.singleAction.isCheckProgressAction
    || param.singleAction.isDetectPotentialProblemsAction
    || param.singleAction.isRecommendStepsAction;
}
