import { createReplyRequestReadPort } from './reply_request_composition_root';
import { createChangeSizeProjectMembershipQueryPort } from './change_size_project_membership_composition_root';
import { bindIssueCommentPublication, bindBranchSyncRetirementComments } from './push_single_action_capability_port_binding';
import { RetireBranchSyncUseCase } from '../../application/usecases/actions/retire_branch_sync_use_case';
import { RetireProgressUseCase } from '../../application/usecases/actions/retire_progress_use_case';
import { RetireClosedIssueCardsUseCase } from '../../application/usecases/actions/retire_closed_issue_cards_use_case';
import { bindIssueCompletion, createIssueCompletionRepository, createNativeStatusReadPort } from './issue_completion_composition_root';
import { PullRequestChangesRepository } from '../../data/repository/pull_request/pull_request_changes_repository';
import {
  createIssueAssignmentClient,
  createIssueContentClient,
  createIssueLabelsClient,
  createIssueMetadataClient,
  createIssueTitleClient,
} from "./github_issue_client_factory";
import { createGraphqlTransportClient } from "./github_project_client_factory";
import { createPullRequestChangesClient, createPullRequestLifecycleClient } from "./github_pull_request_client_factory";
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
import { createFindingsQueryPort, createLanguageQueryPort } from "./agent_capability_composition_root";
import { IssueAssignmentRepository } from "../../data/repository/issue/issue_assignment_repository";
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { IssueLabelRepository } from "../../data/repository/issue/issue_label_repository";
import { IssueMetadataRepository } from "../../data/repository/issue/issue_metadata_repository";
import { IssueTitleRepository } from "../../data/repository/issue/issue_title_repository";
import { PullRequestLifecycleRepository } from "../../data/repository/pull_request/pull_request_lifecycle_repository";
import { composePullRequestUseCase } from "./pull_request_use_case_composition";
import { createPullRequestReviewerCompositionRoot } from "./pull_request_reviewer_composition_root";
import { createOrganizationMembersCompositionRoot } from "./organization_members_composition_root";
import { createProjectBoardCompositionRoot } from "./project_board_composition_root";
import { TimerDelayAdapter } from "../time/timer_delay_adapter";
import { DetectPotentialProblemsUseCase } from "../../application/usecases/steps/commit/detect_potential_problems_use_case";
import { ResolveMessageCatalogUseCase } from '../../application/usecases/localization/resolve_message_catalog_use_case';
import { createBugbotCompositionRoot } from "./bugbot_composition_root";
import { createActorAuthorizationRepository } from './actor_authorization_composition_root';
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import {
  bindIssueDescriptionQuery,
  bindIssueTitle,
  bindOrganizationMembers,
  bindProjectContent,
} from './shared_capability_port_binding';
import {
  bindActorAuthorization,
  bindIssueAssignee,
  bindIssueLabels,
  bindOrganizationMemberSelection,
  bindProjectBoardCommands,
  bindPullRequestDescription,
  bindPullRequestIssueLink,
  bindPullRequestReviewer,
} from './lifecycle_capability_port_binding';

export function createPullRequestUseCaseCompositionRoot(binding: BugbotScmBinding): PullRequestUseCase {
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
  const bugbot = createBugbotCompositionRoot(binding);
  const issueTitle = new IssueTitleRepository(createIssueTitleClient(), issueMetadata);
  const projectContent = bindProjectContent(
    issueMetadata,
    projectBoard.command,
    projectBoard.link,
    binding,
  );
  const issueAssignee = new IssueAssignmentRepository(createIssueAssignmentClient());
  const pullRequestLabels = new IssueLabelRepository(createIssueLabelsClient());
  const pullRequestReviewer = createPullRequestReviewerCompositionRoot();
  const eventualConsistencyDelay = new TimerDelayAdapter();
  const boundIssueAssignee = bindIssueAssignee(issueAssignee, binding);
  const boundOrganizationSelection = bindOrganizationMemberSelection(organizationMembers, binding);
  const boundPullRequestLifecycle = bindPullRequestIssueLink(pullRequestLifecycle, binding);
  const boundProjectBoard = bindProjectBoardCommands(projectBoard.command, binding);

  const workflowSteps = {
    updateTitle: new UpdateTitleUseCase(bindIssueTitle(issueTitle, binding)),
    assignMemberToIssue: new AssignMemberToIssueUseCase(
      boundIssueAssignee,
      boundOrganizationSelection,
    ),
    assignReviewersToIssue: new AssignReviewersToIssueUseCase(
      boundIssueAssignee,
      bindPullRequestReviewer(pullRequestReviewer, binding),
      boundOrganizationSelection,
    ),
    linkPullRequestProject: new LinkPullRequestProjectUseCase(projectContent),
    linkPullRequestIssue: new LinkPullRequestIssueUseCase(
      boundPullRequestLifecycle,
      eventualConsistencyDelay,
    ),
    syncSizeAndProgressLabels: new SyncSizeAndProgressLabelsFromIssueToPrUseCase(
      bindIssueLabels(pullRequestLabels, binding),
      Object.freeze({ setTaskSize: boundProjectBoard.setTaskSize }),
      createChangeSizeProjectMembershipQueryPort(binding),
    ),
    checkPriorityPullRequestSize: new CheckPriorityPullRequestSizeUseCase(
      boundProjectBoard,
    ),
    retireBranchSync: new RetireClosedIssueCardsUseCase(
      new RetireBranchSyncUseCase(createNativeStatusReadPort(binding), bindBranchSyncRetirementComments(bindIssueCommentPublication(issueContent, binding)), createReplyRequestReadPort(binding)),
      new RetireProgressUseCase(createNativeStatusReadPort(binding), bindBranchSyncRetirementComments(bindIssueCommentPublication(issueContent, binding)), createReplyRequestReadPort(binding))),
    closeIssueAfterMerging: new CloseIssueAfterMergingUseCase(bindIssueCompletion(createIssueCompletionRepository(binding))),
  };

  return composePullRequestUseCase(
    new UpdatePullRequestDescriptionUseCase(
      bindPullRequestDescription(pullRequestLifecycle, binding, new PullRequestChangesRepository(createPullRequestChangesClient())),
      bindIssueDescriptionQuery(issueContent, binding),
      bindOrganizationMembers(organizationMembers, binding),
      createFindingsQueryPort(),
    ),
    workflowSteps,
    new DetectPotentialProblemsUseCase(
      createFindingsQueryPort(),
      bugbot.scm,
      bugbot.telemetry,
      new ResolveMessageCatalogUseCase(createLanguageQueryPort()),
    ),
    bindActorAuthorization(createActorAuthorizationRepository(), binding),
  );
}
