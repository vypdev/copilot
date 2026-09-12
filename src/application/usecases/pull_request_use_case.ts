import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import { runPullRequestWorkflow } from "./pull_request_workflow";
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import { projectUpdateTitleContext } from './steps/common/update_title_workflow';
import { projectPullRequestContentLinkContext } from './steps/common/project_content_link_workflow';

export class PullRequestUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "PullRequestUseCase";

  constructor(
    private readonly updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>,
    private readonly workflowSteps: PullRequestWorkflowSteps,
    private readonly reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>,
    private readonly actorAuthorizationPort?: ActorAuthorizationPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runPullRequestWorkflow(param, this.taskId, {
      updatePullRequestDescriptionUseCase: this.updatePullRequestDescriptionUseCase,
      reviewPotentialProblemsUseCase: this.reviewPotentialProblemsUseCase,
      workflowSteps: this.workflowSteps,
      actorAuthorizationPort: this.actorAuthorizationPort,
      sharedContexts: {
        title: projectUpdateTitleContext(param),
        projectLink: projectPullRequestContentLinkContext(param),
      },
    });
  }
}
