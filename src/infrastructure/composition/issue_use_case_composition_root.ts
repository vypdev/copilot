import { createBranchClient } from "./github_branch_client_factory";
import {
  createIssueAssignmentClient,
  createIssueContentClient,
  createIssueLifecycleClient,
  createIssueMetadataClient,
  createIssueTitleClient,
} from "./github_issue_client_factory";
import { createGraphqlTransportClient } from "./github_project_client_factory";
import { createWorkflowDispatchClient } from "./github_workflow_client_factory";
import { IssueUseCase } from "../../application/usecases/issue_use_case";
import { RecommendStepsUseCase } from "../../application/usecases/actions/recommend_steps_use_case";
import { CheckPermissionsUseCase } from "../../application/usecases/steps/common/check_permissions_use_case";
import { UpdateTitleUseCase } from "../../application/usecases/steps/common/update_title_use_case";
import { AssignMemberToIssueUseCase } from "../../application/usecases/steps/issue/assign_members_to_issue_use_case";
import { CheckPriorityIssueSizeUseCase } from "../../application/usecases/steps/issue/check_priority_issue_size_use_case";
import { CloseNotAllowedIssueUseCase } from "../../application/usecases/steps/issue/close_not_allowed_issue_use_case";
import { DeployAddedUseCase } from "../../application/usecases/steps/issue/label_deploy_added_use_case";
import { DeployedAddedUseCase } from "../../application/usecases/steps/issue/label_deployed_added_use_case";
import { LinkIssueProjectUseCase } from "../../application/usecases/steps/issue/link_issue_project_use_case";
import { MoveIssueToInProgressUseCase } from "../../application/usecases/steps/issue/move_issue_to_in_progress";
import { PrepareBranchesUseCase } from "../../application/usecases/steps/issue/prepare_branches_use_case";
import { RemoveIssueBranchesUseCase } from "../../application/usecases/steps/issue/remove_issue_branches_use_case";
import { RemoveNotNeededBranchesUseCase } from "../../application/usecases/steps/issue/remove_not_needed_branches_use_case";
import { UpdateIssueTypeUseCase } from "../../application/usecases/steps/issue/update_issue_type_use_case";
import { AnswerIssueHelpUseCase } from "../../application/usecases/steps/issue/answer_issue_help_use_case";
import { BranchLifecycleRepository } from "../../data/repository/branch_lifecycle_repository";
import { BranchNameRepository } from "../../data/repository/branch_name_repository";
import { LinkedBranchRepository } from "../../data/repository/branch/linked_branch_repository";
import { GitCliRepository } from "../../data/repository/git_cli_repository";
import { IssueAssignmentRepository } from "../../data/repository/issue/issue_assignment_repository";
import { IssueClosureRepository } from "../../data/repository/issue/issue_closure_repository";
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { IssueLifecycleRepository } from "../../data/repository/issue/issue_lifecycle_repository";
import { IssueMetadataRepository } from "../../data/repository/issue/issue_metadata_repository";
import { IssueNotificationRepository } from "../../data/repository/issue/issue_notification_repository";
import { IssueTitleRepository } from "../../data/repository/issue/issue_title_repository";
import { IssueTypeAssignmentRepository } from "../../data/repository/issue/issue_type_assignment_repository";
import { WorkflowDispatchRepository } from "../../data/repository/workflow/workflow_dispatch_repository";
import { TimerBranchPropagationDelayAdapter } from "../time/timer_branch_propagation_delay_adapter";
import { TimerDelayAdapter } from "../time/timer_delay_adapter";
import { createFindingsQueryPort } from "./agent_capability_composition_root";
import { composeIssueUseCase } from "./issue_use_case_composition";
import { createOrganizationMembersCompositionRoot } from "./organization_members_composition_root";
import { createProjectBoardCompositionRoot } from "./project_board_composition_root";

export function createIssueUseCaseCompositionRoot(): IssueUseCase {
  const issueMetadata = new IssueMetadataRepository(
    createIssueMetadataClient(),
    createGraphqlTransportClient(),
  );
  const issueContent = new IssueContentRepository(createIssueContentClient());
  const issueLifecycle = new IssueLifecycleRepository(
    createIssueLifecycleClient(),
  );
  const issueNotification = new IssueNotificationRepository(
    issueLifecycle,
    issueContent,
  );
  const organizationMembers = createOrganizationMembersCompositionRoot();
  const branchLifecycle = new BranchLifecycleRepository(createBranchClient());
  const branchName = new BranchNameRepository();
  const gitCli = new GitCliRepository();
  const linkedBranch = new LinkedBranchRepository(
    createGraphqlTransportClient(),
  );
  const branchPropagationDelay = new TimerBranchPropagationDelayAdapter();
  const eventualConsistencyDelay = new TimerDelayAdapter();
  const projectBoard = createProjectBoardCompositionRoot();
  const issueAssignee = new IssueAssignmentRepository(createIssueAssignmentClient());
  const issueClosure = new IssueClosureRepository(issueLifecycle, issueContent);
  const issueTypeAssignment = new IssueTypeAssignmentRepository(
    (owner, repository, issueNumber, token) =>
      issueMetadata.getId(owner, repository, issueNumber, token),
    createGraphqlTransportClient(),
  );
  const moveIssueToInProgress = new MoveIssueToInProgressUseCase(projectBoard.command);

  const workflowSteps = {
    checkPermissions: new CheckPermissionsUseCase(organizationMembers),
    closeNotAllowedIssue: new CloseNotAllowedIssueUseCase(issueClosure),
    removeIssueBranches: new RemoveIssueBranchesUseCase(branchLifecycle),
    assignMemberToIssue: new AssignMemberToIssueUseCase(
      issueAssignee,
      organizationMembers,
    ),
    updateTitle: new UpdateTitleUseCase(
      new IssueTitleRepository(createIssueTitleClient(), issueMetadata),
    ),
    updateIssueType: new UpdateIssueTypeUseCase(issueTypeAssignment),
    linkIssueProject: new LinkIssueProjectUseCase(
      issueMetadata,
      projectBoard.command,
      projectBoard.link,
      eventualConsistencyDelay,
    ),
    checkPriorityIssueSize: new CheckPriorityIssueSizeUseCase(projectBoard.command),
    prepareBranches: new PrepareBranchesUseCase(
      branchLifecycle,
      branchName,
      gitCli,
      gitCli,
      linkedBranch,
      branchPropagationDelay,
      moveIssueToInProgress,
    ),
    removeNotNeededBranches: new RemoveNotNeededBranchesUseCase(
      branchLifecycle,
      branchName,
    ),
    deployAdded: new DeployAddedUseCase(
      new WorkflowDispatchRepository(createWorkflowDispatchClient()),
      moveIssueToInProgress,
    ),
    deployedAdded: new DeployedAddedUseCase(),
  };

  return composeIssueUseCase(
    new RecommendStepsUseCase(issueContent, createFindingsQueryPort()),
    new AnswerIssueHelpUseCase(issueNotification, createFindingsQueryPort()),
    workflowSteps,
  );
}
