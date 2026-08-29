import {
  createIssueAssignmentClient,
  createIssueContentClient,
  createIssueLabelsClient,
  createIssueLifecycleClient,
  createIssueMetadataClient,
  createIssueTitleClient,
} from "./github_issue_client_factory";
import { createGraphqlTransportClient } from "./github_project_client_factory";
import { createPullRequestLifecycleClient } from "./github_pull_request_client_factory";
import { PullRequestUseCase } from "../../application/usecases/pull_request_use_case";
import { UpdatePullRequestDescriptionUseCase } from "../../application/usecases/steps/pull_request/update_pull_request_description_use_case";
import { UpdateTitleUseCase } from "../../application/usecases/steps/common/update_title_use_case";
import { AssignMemberToIssueUseCase } from "../../application/usecases/steps/issue/assign_members_to_issue_use_case";
import { AssignReviewersToIssueUseCase } from "../../application/usecases/steps/issue/assign_reviewers_to_issue_use_case";
import { CloseIssueAfterMergingUseCase } from "../../application/usecases/steps/issue/close_issue_after_merging_use_case";
import { CheckPriorityPullRequestSizeUseCase } from "../../application/usecases/steps/pull_request/check_priority_pull_request_size_use_case";
import { LinkPullRequestIssueUseCase } from "../../application/usecases/steps/pull_request/link_pull_request_issue_use_case";
import { LinkPullRequestProjectUseCase } from "../../application/usecases/steps/pull_request/link_pull_request_project_use_case";
import { SyncSizeAndProgressLabelsFromIssueToPrUseCase } from "../../application/usecases/steps/pull_request/sync_size_and_progress_labels_from_issue_to_pr_use_case";
import { createFindingsQueryPort } from "./agent_capability_composition_root";
import { IssueAssignmentRepository } from "../../data/repository/issue/issue_assignment_repository";
import { IssueClosureRepository } from "../../data/repository/issue/issue_closure_repository";
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { IssueLabelRepository } from "../../data/repository/issue/issue_label_repository";
import { IssueLifecycleRepository } from "../../data/repository/issue/issue_lifecycle_repository";
import { IssueMetadataRepository } from "../../data/repository/issue/issue_metadata_repository";
import { IssueTitleRepository } from "../../data/repository/issue/issue_title_repository";
import { PullRequestLifecycleRepository } from "../../data/repository/pull_request/pull_request_lifecycle_repository";
import { composePullRequestUseCase } from "./pull_request_use_case_composition";
import { createPullRequestReviewerCompositionRoot } from "./pull_request_reviewer_composition_root";
import { createOrganizationMembersCompositionRoot } from "./organization_members_composition_root";
import { createProjectBoardCompositionRoot } from "./project_board_composition_root";
import { TimerDelayAdapter } from "../time/timer_delay_adapter";

export function createPullRequestUseCaseCompositionRoot(): PullRequestUseCase {
  const issueLifecycle = new IssueLifecycleRepository(
    createIssueLifecycleClient(),
  );
  const issueContent = new IssueContentRepository(createIssueContentClient());
  const pullRequestLifecycle = new PullRequestLifecycleRepository(
    createPullRequestLifecycleClient(),
  );
  const issueMetadata = new IssueMetadataRepository(
    createIssueMetadataClient(),
    createGraphqlTransportClient(),
  );
  const organizationMembers = createOrganizationMembersCompositionRoot();

  const projectBoard = createProjectBoardCompositionRoot();
  const issueTitle = new IssueTitleRepository(createIssueTitleClient(), issueMetadata);
  const issueClosure = new IssueClosureRepository(issueLifecycle, issueContent);
  const issueAssignee = new IssueAssignmentRepository(createIssueAssignmentClient());
  const pullRequestLabels = new IssueLabelRepository(createIssueLabelsClient());
  const pullRequestReviewer = createPullRequestReviewerCompositionRoot();
  const eventualConsistencyDelay = new TimerDelayAdapter();

  const workflowSteps = {
    updateTitle: new UpdateTitleUseCase(issueTitle),
    assignMemberToIssue: new AssignMemberToIssueUseCase(
      issueAssignee,
      organizationMembers,
    ),
    assignReviewersToIssue: new AssignReviewersToIssueUseCase(
      issueAssignee,
      pullRequestReviewer,
      organizationMembers,
    ),
    linkPullRequestProject: new LinkPullRequestProjectUseCase(
      projectBoard.command,
      projectBoard.link,
      eventualConsistencyDelay,
    ),
    linkPullRequestIssue: new LinkPullRequestIssueUseCase(
      pullRequestLifecycle,
      eventualConsistencyDelay,
    ),
    syncSizeAndProgressLabels: new SyncSizeAndProgressLabelsFromIssueToPrUseCase(
      pullRequestLabels,
    ),
    checkPriorityPullRequestSize: new CheckPriorityPullRequestSizeUseCase(
      projectBoard.command,
    ),
    closeIssueAfterMerging: new CloseIssueAfterMergingUseCase(issueClosure),
  };

  return composePullRequestUseCase(
    new UpdatePullRequestDescriptionUseCase(
      pullRequestLifecycle,
      issueContent,
      organizationMembers,
      createFindingsQueryPort(),
    ),
    workflowSteps,
  );
}
