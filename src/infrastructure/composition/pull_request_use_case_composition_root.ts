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

  return composePullRequestUseCase(
    projectBoard.command,
    pullRequestLifecycle,
    issueContent,
    new IssueTitleRepository(createIssueTitleClient(), issueMetadata),
    new IssueClosureRepository(issueLifecycle, issueContent),
    new IssueAssignmentRepository(createIssueAssignmentClient()),
    createPullRequestReviewerCompositionRoot(),
    organizationMembers,
    new IssueLabelRepository(createIssueLabelsClient()),
    pullRequestLifecycle,
    projectBoard.link,
    projectBoard.command,
    new UpdatePullRequestDescriptionUseCase(
      pullRequestLifecycle,
      issueContent,
      organizationMembers,
      createFindingsQueryPort(),
    ),
  );
}
