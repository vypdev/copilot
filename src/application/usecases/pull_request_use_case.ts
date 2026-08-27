import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../../utils/logger";
import { getTaskEmoji } from "../../utils/task_emoji";
import type { ParamUseCase } from "./base/param_usecase";
import { UpdateTitleUseCase } from "./steps/common/update_title_use_case";
import { AssignMemberToIssueUseCase } from "./steps/issue/assign_members_to_issue_use_case";
import { AssignReviewersToIssueUseCase } from "./steps/issue/assign_reviewers_to_issue_use_case";
import { CloseIssueAfterMergingUseCase } from "./steps/issue/close_issue_after_merging_use_case";
import { CheckPriorityPullRequestSizeUseCase } from "./steps/pull_request/check_priority_pull_request_size_use_case";
import type { ProjectBoardPriorityPort } from "./steps/issue/priority_size_check_use_case";
import { LinkPullRequestIssueUseCase } from "./steps/pull_request/link_pull_request_issue_use_case";
import { LinkPullRequestProjectUseCase } from "./steps/pull_request/link_pull_request_project_use_case";
import { SyncSizeAndProgressLabelsFromIssueToPrUseCase } from "./steps/pull_request/sync_size_and_progress_labels_from_issue_to_pr_use_case";
import type { IssueAssigneePort } from "../ports/issue_management_ports";
import type { IssueClosurePort } from "../ports/issue_lifecycle_ports";
import type { IssueDescriptionQueryPort } from "../ports/issue_description_ports";
import type { OrganizationMembersPort } from "../ports/organization_members_ports";
import type { PullRequestDescriptionCommandPort } from "../ports/pull_request_description_ports";
import type { PullRequestReviewerPort } from "../ports/pull_request_reviewer_ports";
import type { PullRequestIssueLinkPort } from "../ports/pull_request_issue_link_ports";
import type { IssueLabelsPort } from "../ports/issue_management_ports";
import type { IssueTitlePort } from "../ports/issue_title_ports";
import type { ProjectBoardCommandPort } from "../ports/project_board_command_ports";
import type { ProjectBoardLinkPort } from "../ports/project_board_link_ports";

export class PullRequestUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "PullRequestUseCase";
  constructor(
    private readonly projectBoardPriorityPort: ProjectBoardPriorityPort,
    private readonly pullRequestDescriptionCommandPort: PullRequestDescriptionCommandPort,
    private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
    private readonly issueTitlePort: IssueTitlePort,
    private readonly issueClosurePort: IssueClosurePort,
    private readonly issueAssigneePort: IssueAssigneePort,
    private readonly pullRequestReviewPort: PullRequestReviewerPort,
    private readonly organizationMembersPort: OrganizationMembersPort,
    private readonly issueLabelsPort: IssueLabelsPort,
    private readonly pullRequestIssueLinkPort: PullRequestIssueLinkPort,
    private readonly projectBoardLinkPort: ProjectBoardLinkPort,
    private readonly projectBoardCommandPort: ProjectBoardCommandPort,
    private readonly updatePullRequestDescriptionUseCase: ParamUseCase<
      Execution,
      Result[]
    >,
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
          ...(await new UpdateTitleUseCase(this.issueTitlePort).invoke(param)),
        );

        /**
         * Assignees
         */
        results.push(
          ...(await new AssignMemberToIssueUseCase(
            this.issueAssigneePort,
            this.organizationMembersPort,
          ).invoke(param)),
        );

        /**
         * Reviewers
         */
        results.push(
          ...(await new AssignReviewersToIssueUseCase(
            this.issueAssigneePort,
            this.pullRequestReviewPort,
            this.organizationMembersPort,
          ).invoke(param)),
        );

        /**
         * Link Pull Request to projects
         */
        results.push(
          ...(await new LinkPullRequestProjectUseCase(
            this.projectBoardCommandPort,
            this.projectBoardLinkPort,
          ).invoke(param)),
        );

        /**
         * Link Pull Request to issue
         */
        results.push(
          ...(await new LinkPullRequestIssueUseCase(
            this.pullRequestIssueLinkPort,
          ).invoke(param)),
        );

        /**
         * Copy size and progress labels from the linked issue to this PR (corner case: PR just opened).
         */
        results.push(
          ...(await new SyncSizeAndProgressLabelsFromIssueToPrUseCase(
            this.issueLabelsPort,
          ).invoke(param)),
        );

        /**
         * Check priority pull request size
         */
        results.push(
          ...(await new CheckPriorityPullRequestSizeUseCase(
            this.projectBoardPriorityPort,
          ).invoke(param)),
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
          ...(await new CloseIssueAfterMergingUseCase(
            this.issueClosurePort,
          ).invoke(param)),
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
