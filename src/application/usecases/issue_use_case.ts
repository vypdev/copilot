import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ApplicationError } from '../errors/application_error';
import { logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { runIssueWorkflow, type IssueWorkflowRouteContext } from "./issue_workflow";
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BoundIssueCommentQueryPort } from '../ports/issue_lifecycle_ports';
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
import { ISSUE_START_LABEL } from '../../domain/issue_start_policy';

export class IssueUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "IssueUseCase";

  constructor(
    private readonly recommendStepsUseCase: ParamUseCase<RecommendStepsContext, RecommendStepsOutcome>,
    private readonly answerIssueHelpUseCase: ParamUseCase<AnswerIssueHelpContext, Result[]>,
    private readonly workflowSteps: IssueWorkflowSteps,
    private readonly issueCommentQueryPort: BoundIssueCommentQueryPort,
    private readonly actorAuthorizationPort?: BoundActorAuthorizationPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
  const admission = param.issueWorkflowAdmission;
    if (param.isIssue && admission && admission.status !== 'eligible') {
      return [buildIssueWorkflowAdmissionResult(this.taskId, admission)];
    }
    const outcome = await runIssueWorkflow(projectIssueWorkflowRouteContext(param), this.taskId, {
      recommendStepsUseCase: this.recommendStepsUseCase,
      answerIssueHelpUseCase: this.answerIssueHelpUseCase,
      workflowSteps: this.workflowSteps,
      actorAuthorizationPort: this.actorAuthorizationPort,
      issueCommentQueryPort: this.issueCommentQueryPort,
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

function buildIssueWorkflowAdmissionResult(
  taskId: string,
  admission: NonNullable<Execution['issueWorkflowAdmission']>,
): Result {
  if (admission.status === 'unmanaged') {
    return new Result({
      id: taskId,
      success: true,
      executed: false,
      steps: ['⏭️ Issue is unmanaged: no recognized enabled issue workflow label was found.'],
    });
  }
  const message = admission.status === 'disabled'
    ? `Issue workflow "${admission.kind}" is disabled in the repository profile.`
    : admission.status === 'conflict'
      ? `Issue has conflicting workflow labels: ${admission.kinds.join(', ')}.`
      : admission.status === 'invalid'
        ? `The ${admission.kind} Issue Form is incomplete; ${admission.missingHeadings.length > 0
          ? `missing headings: ${admission.missingHeadings.join(', ')}`
          : `invalid fields: ${admission.invalidFields?.join(', ') ?? 'unknown'}`}.`
        : 'Issue workflow admission failed.';
  return new Result({
    id: taskId,
    success: false,
    executed: true,
    steps: [`🛑 ${message}`],
    errors: [new ApplicationError('configuration.invalid', message)],
  });
}

function projectIssueWorkflowRouteContext(param: Execution): IssueWorkflowRouteContext {
  const started = param.issueStartDecision.started;
  const startEvent = param.issue.labeled && param.issue.labelAdded === ISSUE_START_LABEL;
  const recommendation = !started || (!startEvent && !param.issue.descriptionEdited && !param.issue.opened)
    ? undefined
    : param.labels.isRelease || param.labels.isHotfix
        ? undefined
        : param.labels.isQuestion || param.labels.isHelp
          ? 'answer-help' as const
          : 'recommend' as const;
  return Object.freeze({
    started,
    sddRequired: param.issueStartDecision.sddRequired,
    sddPublished: false,
    issueNumber: param.issue.number,
    branchName: param.currentConfiguration.workingBranch,
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
