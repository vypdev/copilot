import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import { runPullRequestWorkflow, type PullRequestWorkflowRouteContext } from "./pull_request_workflow";
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import { projectUpdateTitleContext } from './steps/common/update_title_workflow';
import { projectPullRequestContentLinkContext } from './steps/common/project_content_link_workflow';
import {
  projectPullRequestWorkflowStepContexts,
  type PullRequestDescriptionRequest,
} from './pull_request_workflow_context';
import { projectBugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';

export class PullRequestUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "PullRequestUseCase";

  constructor(
    private readonly updatePullRequestDescriptionUseCase: ParamUseCase<PullRequestDescriptionRequest, Result[]>,
    private readonly workflowSteps: PullRequestWorkflowSteps,
    private readonly reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>,
    private readonly actorAuthorizationPort?: BoundActorAuthorizationPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runPullRequestWorkflow(projectPullRequestWorkflowRouteContext(param), this.taskId, {
      updatePullRequestDescriptionUseCase: this.updatePullRequestDescriptionUseCase,
      reviewPotentialProblemsUseCase: this.reviewPotentialProblemsUseCase,
      workflowSteps: this.workflowSteps,
      actorAuthorizationPort: this.actorAuthorizationPort,
      sharedContexts: {
        title: projectUpdateTitleContext(param),
        projectLink: projectPullRequestContentLinkContext(param),
        steps: projectPullRequestWorkflowStepContexts(param),
      },
    });
  }
}

function projectPullRequestWorkflowRouteContext(param: Execution): PullRequestWorkflowRouteContext {
  const mode = param.ai.getPullRequestDescriptionMode();
  return Object.freeze({
    actor: param.actor,
    membersOnly: param.ai.getAiMembersOnly(),
    action: param.pullRequest.action,
    opened: param.pullRequest.isOpened,
    synchronize: param.pullRequest.isSynchronize,
    closed: param.pullRequest.isClosed,
    merged: param.pullRequest.isMerged,
    automaticDescription: mode === 'replace' || mode === 'append',
    reviewable: ['opened', 'reopened', 'synchronize'].includes(param.pullRequest.action),
    review: projectBugbotReviewOperationContext(param),
  });
}
