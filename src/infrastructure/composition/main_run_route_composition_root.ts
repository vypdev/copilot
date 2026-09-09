import { CommitUseCase } from "../../application/usecases/commit_use_case";
import { IssueCommentUseCase } from "../../application/usecases/issue_comment_use_case";
import type { ProjectBoardCommandPort } from "../../application/ports/project_board_command_ports";
import { PullRequestReviewCommentUseCase } from "../../application/usecases/pull_request_review_comment_use_case";
import { SingleActionUseCase } from "../../application/usecases/single_action_use_case";
import type { MainRunRouteHandlers } from "../../application/ports/main_run_route_ports";
import { CreateReleaseUseCase } from "../../application/usecases/actions/create_release_use_case";
import { CreateTagUseCase } from "../../application/usecases/actions/create_tag_use_case";
import { DeployedActionUseCase } from "../../application/usecases/actions/deployed_action_use_case";
import { PublishGithubActionUseCase } from "../../application/usecases/actions/publish_github_action_use_case";
import { PublishIssueCommentUseCase } from "../../application/usecases/actions/publish_issue_comment_use_case";
import { RecommendStepsUseCase } from "../../application/usecases/actions/recommend_steps_use_case";
import { CheckChangesIssueSizeUseCase } from "../../application/usecases/steps/commit/check_changes_issue_size_use_case";
import { BugbotAutofixUseCase } from "../../application/usecases/steps/commit/bugbot/bugbot_autofix_use_case";
import { DetectBugbotFixIntentUseCase } from "../../application/usecases/steps/commit/bugbot/detect_bugbot_fix_intent_use_case";
import { DismissBugbotFindingsUseCase } from "../../application/usecases/steps/commit/bugbot/dismiss_bugbot_findings_use_case";
import { RememberBugbotRuleUseCase } from "../../application/usecases/steps/commit/bugbot/remember_bugbot_rule_use_case";
import { DetectPotentialProblemsUseCase } from "../../application/usecases/steps/commit/detect_potential_problems_use_case";
import { NotifyNewCommitOnIssueUseCase } from "../../application/usecases/steps/commit/notify_new_commit_on_issue_use_case";
import { DoUserRequestUseCase } from "../../application/usecases/steps/commit/user_request_use_case";
import { ThinkUseCase } from "../../application/usecases/steps/common/think_use_case";
import { CheckIssueCommentLanguageUseCase } from "../../application/usecases/steps/issue_comment/check_issue_comment_language_use_case";
import { CheckPullRequestCommentLanguageUseCase } from "../../application/usecases/steps/pull_request_review_comment/check_pull_request_comment_language_use_case";
import { CommentLanguageTranslationWorkflow } from "../../application/usecases/steps/common/comment_language_translation_workflow";
import { BranchCompareRepository } from "../../data/repository/branch_compare_repository";
import { MergeRepository } from "../../data/repository/merge_repository";
import { RepositoryReleasePublicationRepository } from "../../data/repository/release/repository_release_publication_repository";
import { RepositoryTagRepository } from "../../data/repository/release/repository_tag_repository";
import { GitCommitAdapter } from "../git_commit_adapter";
import { createActorAuthorizationRepository } from "./actor_authorization_composition_root";
import {
  createFindingsQueryPort,
  createFixerQueryPort,
  createLanguageQueryPort,
} from "./agent_capability_composition_root";
import { createAuthenticatedUserCompositionRoot } from "./authenticated_user_composition_root";
import { createBugbotCompositionRoot } from "./bugbot_composition_root";
import { createCheckProgressCompositionRoot } from "./check_progress_composition_root";
import {
  createBranchComparisonClient,
  createBranchMergeClient,
} from "./github_branch_client_factory";
import { createPullRequestLifecycleClient } from "./github_pull_request_client_factory";
import { createReleaseClient } from "./github_release_client_factory";
import { createInitialSetupCompositionRoot } from "./initial_setup_composition_root";
import { createIssueContentCompositionRoot } from "./issue_content_composition_root";
import {
  createIssueClosureRepository,
  createIssueNotificationRepository,
} from "./issue_interaction_composition_root";
import { createIssueLabelRepository } from "./issue_labels_composition_root";
import { createIssueUseCaseCompositionRoot } from "./issue_use_case_composition_root";
import { createPullRequestUseCaseCompositionRoot } from "./pull_request_use_case_composition_root";
import { createOrganizationMembersCompositionRoot } from "./organization_members_composition_root";
import { UpdatePullRequestDescriptionUseCase } from "../../application/usecases/steps/pull_request/update_pull_request_description_use_case";
import { PullRequestLifecycleRepository } from "../../data/repository/pull_request/pull_request_lifecycle_repository";
import { createCloseInactiveIssuesUseCase } from "./issue_inactivity_composition_root";
import { createGraphqlTransportClient } from "./github_project_client_factory";
import { BranchDependencyRepository } from "../../data/repository/branch_sync/branch_dependency_repository";
import { BranchSyncWorkspaceAdapter } from "../branch_sync_workspace_adapter";
import { ObserveBranchSyncUseCase } from "../../application/usecases/actions/observe_branch_sync_use_case";
import { SyncBranchUseCase } from "../../application/usecases/branch_sync/sync_branch_use_case";
import { DeploymentOrchestrationUseCase } from "../../application/usecases/actions/deployment_orchestration_use_case";
import { GithubDeploymentRepository } from "../../data/repository/deployment/github_deployment_repository";
import { DeploymentContinuationRepository } from "../../data/repository/deployment/deployment_continuation_repository";
import { DeploymentPresentationRepository } from "../../data/repository/deployment/deployment_presentation_repository";
import { DeploymentStateRepository } from "../../data/repository/deployment/deployment_state_repository";
import { LegacyDeploymentMergeRepository } from "../../data/repository/deployment/legacy_deployment_merge_repository";
import { OctokitDeploymentClientAdapter } from "../github/octokit_deployment_adapter";
import { WorkflowDispatchRepository } from "../../data/repository/workflow/workflow_dispatch_repository";
import { createWorkflowDispatchClient } from "./github_workflow_client_factory";
import { randomUUID } from "node:crypto";

function createDetectPotentialProblemsUseCase(): DetectPotentialProblemsUseCase {
  const bugbot = createBugbotCompositionRoot();
  return new DetectPotentialProblemsUseCase(
    createFindingsQueryPort(),
    bugbot.context,
    bugbot.publication,
    bugbot.resolution,
    bugbot.telemetry,
  );
}

export function createSingleActionUseCaseCompositionRoot(): SingleActionUseCase {
  const repositoryTagPort = new RepositoryTagRepository(createReleaseClient());
  const repositoryReleasePort = new RepositoryReleasePublicationRepository(
    createReleaseClient(),
  );
  const issueDescriptionQueryPort = createIssueContentCompositionRoot();
  const deploymentRepository = new GithubDeploymentRepository(new OctokitDeploymentClientAdapter());
  const deploymentOrchestration = new DeploymentOrchestrationUseCase({
    pullRequests: deploymentRepository,
    git: deploymentRepository,
    continuation: new DeploymentContinuationRepository(
      new WorkflowDispatchRepository(createWorkflowDispatchClient()),
    ),
    legacyMerge: new LegacyDeploymentMergeRepository(createBranchMergeClient()),
    presentation: new DeploymentPresentationRepository(issueDescriptionQueryPort),
    state: new DeploymentStateRepository(issueDescriptionQueryPort),
    labels: createIssueLabelRepository(),
    issues: createIssueClosureRepository(),
    operationId: randomUUID,
  });
  return new SingleActionUseCase(
    new DeployedActionUseCase(
      createIssueLabelRepository(),
      createIssueClosureRepository(),
      new MergeRepository(createBranchMergeClient()),
    ),
    new PublishGithubActionUseCase(repositoryTagPort, repositoryReleasePort),
    new CreateReleaseUseCase(repositoryReleasePort),
    new CreateTagUseCase(repositoryTagPort),
    new ThinkUseCase(
      issueDescriptionQueryPort,
      createIssueNotificationRepository(),
      createFindingsQueryPort(),
    ),
    createInitialSetupCompositionRoot(),
    createCheckProgressCompositionRoot(),
    createDetectPotentialProblemsUseCase(),
    new RecommendStepsUseCase(
      issueDescriptionQueryPort,
      createFindingsQueryPort(),
    ),
    createCloseInactiveIssuesUseCase(),
    createActorAuthorizationRepository(),
    new PublishIssueCommentUseCase(issueDescriptionQueryPort),
    new ObserveBranchSyncUseCase(
      new BranchDependencyRepository(createGraphqlTransportClient()),
      new BranchCompareRepository(createBranchComparisonClient()),
      issueDescriptionQueryPort,
    ),
    deploymentOrchestration,
  );
}

export function createIssueCommentUseCaseCompositionRoot(): IssueCommentUseCase {
  const bugbot = createBugbotCompositionRoot();
  const findings = createFindingsQueryPort();
  const language = createLanguageQueryPort();
  const fixer = createFixerQueryPort();
  const gitCommit = new GitCommitAdapter();
  const pullRequestDescription = new UpdatePullRequestDescriptionUseCase(
    new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
    createIssueContentCompositionRoot(),
    createOrganizationMembersCompositionRoot(),
    createFindingsQueryPort(),
  );
  const branchSync = new SyncBranchUseCase(
    new BranchDependencyRepository(createGraphqlTransportClient()),
    new BranchSyncWorkspaceAdapter(gitCommit),
    fixer,
    createAuthenticatedUserCompositionRoot(),
    gitCommit,
  );

  return new IssueCommentUseCase(
    new CheckIssueCommentLanguageUseCase(
      new CommentLanguageTranslationWorkflow(bugbot.issue, language),
    ),
    new DetectBugbotFixIntentUseCase(
      bugbot.context.pullRequest,
      findings,
      bugbot.context,
    ),
    new ThinkUseCase(
      createIssueContentCompositionRoot(),
      createIssueNotificationRepository(),
      findings,
    ),
    new BugbotAutofixUseCase(fixer, bugbot.context, gitCommit),
    new DoUserRequestUseCase(fixer, gitCommit),
    bugbot.issue,
    createActorAuthorizationRepository(),
    createAuthenticatedUserCompositionRoot(),
    gitCommit,
    new DismissBugbotFindingsUseCase({ contextPorts: bugbot.context, resolutionPorts: bugbot.resolution }),
    new DetectPotentialProblemsUseCase(findings, bugbot.context, bugbot.publication, bugbot.resolution, bugbot.telemetry),
    pullRequestDescription,
    new RememberBugbotRuleUseCase(bugbot.rules),
    branchSync,
  );
}

export function createPullRequestReviewCommentUseCaseCompositionRoot(): PullRequestReviewCommentUseCase {
  const bugbot = createBugbotCompositionRoot();
  const findings = createFindingsQueryPort();
  const language = createLanguageQueryPort();
  const fixer = createFixerQueryPort();
  const gitCommit = new GitCommitAdapter();
  const pullRequestDescription = new UpdatePullRequestDescriptionUseCase(
    new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
    createIssueContentCompositionRoot(),
    createOrganizationMembersCompositionRoot(),
    createFindingsQueryPort(),
  );
  const branchSync = new SyncBranchUseCase(
    new BranchDependencyRepository(createGraphqlTransportClient()),
    new BranchSyncWorkspaceAdapter(gitCommit),
    fixer,
    createAuthenticatedUserCompositionRoot(),
    gitCommit,
  );

  return new PullRequestReviewCommentUseCase(
    new CheckPullRequestCommentLanguageUseCase(
      new CommentLanguageTranslationWorkflow(bugbot.issue, language),
    ),
    new DetectBugbotFixIntentUseCase(
      bugbot.context.pullRequest,
      findings,
      bugbot.context,
    ),
    new ThinkUseCase(
      createIssueContentCompositionRoot(),
      createIssueNotificationRepository(),
      findings,
    ),
    new BugbotAutofixUseCase(fixer, bugbot.context, gitCommit),
    new DoUserRequestUseCase(fixer, gitCommit),
    bugbot.issue,
    createActorAuthorizationRepository(),
    createAuthenticatedUserCompositionRoot(),
    gitCommit,
    new DismissBugbotFindingsUseCase({ contextPorts: bugbot.context, resolutionPorts: bugbot.resolution }),
    new DetectPotentialProblemsUseCase(findings, bugbot.context, bugbot.publication, bugbot.resolution, bugbot.telemetry),
    pullRequestDescription,
    new RememberBugbotRuleUseCase(bugbot.rules),
    branchSync,
  );
}

export function createCommitUseCaseCompositionRoot(
  projectBoardCommandPort: ProjectBoardCommandPort,
): CommitUseCase {
  return new CommitUseCase(
    new NotifyNewCommitOnIssueUseCase(createIssueNotificationRepository()),
    new CheckChangesIssueSizeUseCase(
      projectBoardCommandPort,
      createIssueLabelRepository(),
      new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
      new BranchCompareRepository(createBranchComparisonClient()),
    ),
    createDetectPotentialProblemsUseCase(),
    createCheckProgressCompositionRoot(),
    createActorAuthorizationRepository(),
  );
}

export function createMainRunRouteCompositionRoot(
  projectBoardCommandPort: ProjectBoardCommandPort,
): MainRunRouteHandlers {
  // Composition is scoped to one main run. Each route is built only when it is
  // actually selected, while repeated calls in the same run reuse its graph.
  const singleAction = lazy(() => createSingleActionUseCaseCompositionRoot());
  const issueComment = lazy(() => createIssueCommentUseCaseCompositionRoot());
  const issue = lazy(() => createIssueUseCaseCompositionRoot());
  const pullRequestReviewComment = lazy(() => createPullRequestReviewCommentUseCaseCompositionRoot());
  const pullRequest = lazy(() => createPullRequestUseCaseCompositionRoot());
  const push = lazy(() => createCommitUseCaseCompositionRoot(projectBoardCommandPort));

  return {
    "single-action": async (execution) =>
      singleAction().invoke(execution),
    "issue-comment": async (execution) =>
      issueComment().invoke(execution),
    issue: async (execution) =>
      issue().invoke(execution),
    "pull-request-review-comment": async (execution) =>
      pullRequestReviewComment().invoke(execution),
    "pull-request": async (execution) =>
      pullRequest().invoke(execution),
    push: async (execution) =>
      push().invoke(execution),
  };
}

function lazy<T>(factory: () => T): () => T {
  let value: T | undefined;
  return () => value ?? (value = factory());
}
