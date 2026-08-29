import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";

export class PullRequestUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "PullRequestUseCase";
  constructor(
    private readonly updatePullRequestDescriptionUseCase: ParamUseCase<
      Execution,
      Result[]
    >,
    private readonly workflowSteps: PullRequestWorkflowSteps,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

    const results: Result[] = [];
    try {
      logDebugInfo(`PR action ${param.pullRequest.action}`);
      logDebugInfo(`PR isOpened ${param.pullRequest.isOpened}`);
      logDebugInfo(`PR isMerged ${param.pullRequest.isMerged}`);
      logDebugInfo(`PR isClosed ${param.pullRequest.isClosed}`);
      if (param.pullRequest.isOpened) {
        /**
         * Update title
         */
        results.push(
          ...(await this.workflowSteps.updateTitle.invoke(param)),
        );

        /**
         * Assignees
         */
        results.push(
          ...(await this.workflowSteps.assignMemberToIssue.invoke(param)),
        );

        /**
         * Reviewers
         */
        results.push(
          ...(await this.workflowSteps.assignReviewersToIssue.invoke(param)),
        );

        /**
         * Link Pull Request to projects
         */
        results.push(
          ...(await this.workflowSteps.linkPullRequestProject.invoke(param)),
        );

        /**
         * Link Pull Request to issue
         */
        results.push(
          ...(await this.workflowSteps.linkPullRequestIssue.invoke(param)),
        );

        /**
         * Copy size and progress labels from the linked issue to this PR (corner case: PR just opened).
         */
        results.push(
          ...(await this.workflowSteps.syncSizeAndProgressLabels.invoke(param)),
        );

        /**
         * Check priority pull request size
         */
        results.push(
          ...(await this.workflowSteps.checkPriorityPullRequestSize.invoke(param)),
        );

        if (param.ai.getAiPullRequestDescription()) {
          /**
           * Update pull request description
           */
          results.push(
            ...(await this.updatePullRequestDescriptionUseCase.invoke(param)),
          );
        }
      } else if (param.pullRequest.isSynchronize) {
        /**
         * Pushed changes to the pull request (size/progress are updated on push via CommitUseCase).
         */
        if (param.ai.getAiPullRequestDescription()) {
          /**
           * Update pull request description
           */
          results.push(
            ...(await this.updatePullRequestDescriptionUseCase.invoke(param)),
          );
        }
      } else if (param.pullRequest.isClosed && param.pullRequest.isMerged) {
        /**
         * Close issue if needed
         */
        results.push(
          ...(await this.workflowSteps.closeIssueAfterMerging.invoke(param)),
        );
      }
    } catch {
      const semanticError = new Error("Unable to process the pull request.");
      logError(semanticError);
      results.push(
        new Result({
          id: this.taskId,
          success: false,
          executed: true,
          steps: ["Unable to process the pull request."],
          errors: [semanticError],
        }),
      );
    }
    return results;
  }
}
