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
  const branchLifecycle = new BranchLifecycleRepository(createBranchClient());
  const branchName = new BranchNameRepository();
  const gitCli = new GitCliRepository();
  const linkedBranch = new LinkedBranchRepository(
    createGraphqlTransportClient(),
  );
  const branchPropagationDelay = new TimerBranchPropagationDelayAdapter();
  const projectBoard = createProjectBoardCompositionRoot();

  return composeIssueUseCase(
    projectBoard.command,
    createOrganizationMembersCompositionRoot(),
    issueMetadata,
    projectBoard.command,
    projectBoard.link,
    new IssueTitleRepository(createIssueTitleClient(), issueMetadata),
    new IssueAssignmentRepository(createIssueAssignmentClient()),
    new IssueClosureRepository(issueLifecycle, issueContent),
    new IssueTypeAssignmentRepository(
      (owner, repository, issueNumber, token) =>
        issueMetadata.getId(owner, repository, issueNumber, token),
      createGraphqlTransportClient(),
    ),
    issueContent,
    issueNotification,
    branchLifecycle,
    branchName,
    gitCli,
    gitCli,
    linkedBranch,
    branchPropagationDelay,
    new WorkflowDispatchRepository(createWorkflowDispatchClient()),
    new RecommendStepsUseCase(issueContent, createFindingsQueryPort()),
    new AnswerIssueHelpUseCase(issueNotification, createFindingsQueryPort()),
  );
}
