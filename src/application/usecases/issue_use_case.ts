import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo } from "../../utils/logger";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import { CheckPermissionsUseCase } from "./steps/common/check_permissions_use_case";
import { UpdateTitleUseCase } from "./steps/common/update_title_use_case";
import { AssignMemberToIssueUseCase } from "./steps/issue/assign_members_to_issue_use_case";
import { CheckPriorityIssueSizeUseCase } from "./steps/issue/check_priority_issue_size_use_case";
import { CloseNotAllowedIssueUseCase } from "./steps/issue/close_not_allowed_issue_use_case";
import { DeployAddedUseCase } from "./steps/issue/label_deploy_added_use_case";
import { DeployedAddedUseCase } from "./steps/issue/label_deployed_added_use_case";
import { LinkIssueProjectUseCase } from "./steps/issue/link_issue_project_use_case";
import { PrepareBranchesUseCase } from "./steps/issue/prepare_branches_use_case";
import { RemoveIssueBranchesUseCase } from "./steps/issue/remove_issue_branches_use_case";
import { RemoveNotNeededBranchesUseCase } from "./steps/issue/remove_not_needed_branches_use_case";
import { UpdateIssueTypeUseCase } from "./steps/issue/update_issue_type_use_case";
import type { ProjectBoardPriorityPort } from "./steps/issue/priority_size_check_use_case";
import type { OrganizationMembersPort } from "../ports/organization_members_ports";
import type {
  IssueAssigneePort,
  IssueTypeAssignmentPort,
} from "../ports/issue_management_ports";
import type {
  IssueClosurePort,
  IssueNotificationPort,
} from "../ports/issue_lifecycle_ports";
import type { IssueDescriptionQueryPort } from "../ports/issue_description_ports";
import type { IssueIdentityQueryPort } from "../ports/issue_identity_ports";
import type { IssueTitlePort } from "../ports/issue_title_ports";
import type { ProjectBoardCommandPort } from "../ports/project_board_command_ports";
import type { ProjectBoardLinkPort } from "../ports/project_board_link_ports";
import type {
  BranchLifecyclePort,
  BranchNamePort,
} from "../ports/branch_lifecycle_ports";
import type {
  BranchPropagationDelayPort,
  CommitTagQueryPort,
  LinkedBranchCommandPort,
  RemoteBranchSyncPort,
} from "../ports/branch_preparation_ports";
import type { BranchWorkflowPort } from "../ports/branch_workflow_ports";

export class IssueUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "IssueUseCase";
  constructor(
    private readonly projectBoardPriorityPort: ProjectBoardPriorityPort,
    private readonly organizationMembersPort: OrganizationMembersPort,
    private readonly issueIdentityQueryPort: IssueIdentityQueryPort,
    private readonly projectBoardPort: ProjectBoardCommandPort,
    private readonly projectBoardLinkPort: ProjectBoardLinkPort,
    private readonly issueTitlePort: IssueTitlePort,
    private readonly issueAssigneePort: IssueAssigneePort,
    private readonly issueClosurePort: IssueClosurePort,
    private readonly issueTypeAssignmentPort: IssueTypeAssignmentPort,
    private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
    private readonly issueNotificationPort: IssueNotificationPort,
    private readonly branchLifecyclePort: BranchLifecyclePort,
    private readonly branchNamePort: BranchNamePort,
    private readonly remoteBranchSyncPort: RemoteBranchSyncPort,
    private readonly commitTagQueryPort: CommitTagQueryPort,
    private readonly linkedBranchCommandPort: LinkedBranchCommandPort,
    private readonly branchPropagationDelayPort: BranchPropagationDelayPort,
    private readonly branchWorkflowPort: BranchWorkflowPort,
    private readonly recommendStepsUseCase: ParamUseCase<Execution, Result[]>,
    private readonly answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

    const results: Result[] = [];

    const permissionResult = await new CheckPermissionsUseCase(
      this.organizationMembersPort,
    ).invoke(param);
    const lastAction = permissionResult[permissionResult.length - 1];
    if (!lastAction.success && lastAction.executed) {
      results.push(...permissionResult);
      results.push(
        ...(await new CloseNotAllowedIssueUseCase(this.issueClosurePort).invoke(
          param,
        )),
      );
      return results;
    }

    if (param.cleanIssueBranches) {
      results.push(
        ...(await new RemoveIssueBranchesUseCase(
          this.branchLifecyclePort,
        ).invoke(param)),
      );
    }

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
     * Update title
     */
    results.push(
      ...(await new UpdateTitleUseCase(this.issueTitlePort).invoke(param)),
    );

    /**
     * Update issue type
     */
    results.push(
      ...(await new UpdateIssueTypeUseCase(this.issueTypeAssignmentPort).invoke(
        param,
      )),
    );

    /**
     * Link issue to project
     */
    results.push(
      ...(await new LinkIssueProjectUseCase(
        this.issueIdentityQueryPort,
        this.projectBoardPort,
        this.projectBoardLinkPort,
      ).invoke(param)),
    );

    /**
     * Check priority issue size
     */
    results.push(
      ...(await new CheckPriorityIssueSizeUseCase(
        this.projectBoardPriorityPort,
      ).invoke(param)),
    );

    /**
     * Prepare branches
     */
    if (param.isBranched) {
      results.push(
        ...(await new PrepareBranchesUseCase(
          this.projectBoardPort,
          this.branchLifecyclePort,
          this.branchNamePort,
          this.remoteBranchSyncPort,
          this.commitTagQueryPort,
          this.linkedBranchCommandPort,
          this.branchPropagationDelayPort,
        ).invoke(param)),
      );
    } else {
      results.push(
        ...(await new RemoveIssueBranchesUseCase(
          this.branchLifecyclePort,
        ).invoke(param)),
      );
    }

    /**
     * Remove unnecessary branches
     */
    results.push(
      ...(await new RemoveNotNeededBranchesUseCase(
        this.branchLifecyclePort,
        this.branchNamePort,
      ).invoke(param)),
    );

    /**
     * Check if deploy label was added
     */
    results.push(
      ...(await new DeployAddedUseCase(
        this.projectBoardPort,
        this.branchWorkflowPort,
      ).invoke(param)),
    );

    /**
     * Check if deployed label was added
     */
    results.push(...(await new DeployedAddedUseCase().invoke(param)));

    /**
     * Analyze new issues and issue-description changes. Other edits (title,
     * project, assignment, labels) must not invoke the agent again.
     */
    if (param.issue.opened || param.issue.descriptionEdited) {
      const isRelease = param.labels.isRelease;
      const isQuestionOrHelp = param.labels.isQuestion || param.labels.isHelp;
      if (!isRelease && !isQuestionOrHelp) {
        results.push(...(await this.recommendStepsUseCase.invoke(param)));
      } else if (isQuestionOrHelp) {
        results.push(...(await this.answerIssueHelpUseCase.invoke(param)));
      }
    }

    return results;
  }
}
