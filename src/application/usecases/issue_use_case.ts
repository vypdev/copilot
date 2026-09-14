import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { runIssueWorkflow, type IssueWorkflowRouteContext } from "./issue_workflow";
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import { projectCheckPermissionsContext } from './steps/common/check_permissions_workflow';
import { projectUpdateTitleContext } from './steps/common/update_title_workflow';
import { projectIssueContentLinkContext } from './steps/common/project_content_link_workflow';
import {
  projectIssueWorkflowStepContexts,
  type AnswerIssueHelpContext,
} from './issue_workflow_context';
import {
  projectRecommendStepsContext,
  type RecommendStepsContext,
  type RecommendStepsOutcome,
} from './push_single_action_contexts';
import type { BranchConfigurationPatch } from './issue_workflow_context';

export class IssueUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "IssueUseCase";

  constructor(
    private readonly recommendStepsUseCase: ParamUseCase<RecommendStepsContext, RecommendStepsOutcome>,
    private readonly answerIssueHelpUseCase: ParamUseCase<AnswerIssueHelpContext, Result[]>,
    private readonly workflowSteps: IssueWorkflowSteps,
    private readonly actorAuthorizationPort?: BoundActorAuthorizationPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    const outcome = await runIssueWorkflow(projectIssueWorkflowRouteContext(param), this.taskId, {
      recommendStepsUseCase: this.recommendStepsUseCase,
      answerIssueHelpUseCase: this.answerIssueHelpUseCase,
      workflowSteps: this.workflowSteps,
      actorAuthorizationPort: this.actorAuthorizationPort,
      sharedContexts: {
        permissions: projectCheckPermissionsContext(param),
        title: projectUpdateTitleContext(param),
        projectLink: projectIssueContentLinkContext(param),
        steps: projectIssueWorkflowStepContexts(param),
      },
    });
    applyBranchConfigurationPatch(param, outcome.branchConfigurationPatch);
    if (outcome.recommendationStatePatch) {
      param.currentConfiguration.recommendationState = { ...outcome.recommendationStatePatch.recommendationState };
    }
    return [...outcome.results];
  }
}

function projectIssueWorkflowRouteContext(param: Execution): IssueWorkflowRouteContext {
  const recommendation = !param.issue.opened && !param.issue.descriptionEdited
    ? undefined
    : param.labels.isRelease || param.labels.isHotfix
        ? undefined
        : param.labels.isQuestion || param.labels.isHelp
          ? 'answer-help' as const
          : 'recommend' as const;
  return Object.freeze({
    cleanIssueBranches: param.cleanIssueBranches,
    branched: param.isBranched,
    membersOnly: param.ai.getAiMembersOnly(),
    actor: param.actor,
    newIssue: param.eventName === 'issues' && param.inputs?.action === 'opened',
    onboardingEligible: !param.labels.isRelease && !param.labels.isHotfix,
    ...(param.tokenUser ? { tokenUser: param.tokenUser } : {}),
    ...(recommendation ? { recommendation } : {}),
    recommendSteps: projectRecommendStepsContext(param),
  });
}

function applyBranchConfigurationPatch(param: Execution, patch: BranchConfigurationPatch | undefined): void {
  if (!patch) return;
  if (patch.parentBranch !== undefined) param.currentConfiguration.parentBranch = patch.parentBranch;
  if (patch.workingBranch !== undefined) param.currentConfiguration.workingBranch = patch.workingBranch;
  if (patch.releaseBranch !== undefined) param.currentConfiguration.releaseBranch = patch.releaseBranch;
  if (patch.releaseOriginBranch !== undefined) param.currentConfiguration.releaseOriginBranch = patch.releaseOriginBranch;
  if (patch.releaseOriginSha !== undefined) param.currentConfiguration.releaseOriginSha = patch.releaseOriginSha;
  if (patch.hotfixBranch !== undefined) param.currentConfiguration.hotfixBranch = patch.hotfixBranch;
  if (patch.hotfixOriginSha !== undefined) param.currentConfiguration.hotfixOriginSha = patch.hotfixOriginSha;
}
