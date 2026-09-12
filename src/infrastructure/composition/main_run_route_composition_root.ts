import { CommitUseCase } from "../../application/usecases/commit_use_case";
import { IssueCommentUseCase } from "../../application/usecases/issue_comment_use_case";
import type { ProjectBoardCommandPort } from "../../application/ports/project_board_command_ports";
import { PullRequestReviewCommentUseCase } from "../../application/usecases/pull_request_review_comment_use_case";
import { SingleActionUseCase } from "../../application/usecases/single_action_use_case";
import type { MainRunRouteHandlers } from "../../application/ports/main_run_route_ports";
import { CreateReleaseUseCase } from "../../application/usecases/actions/create_release_use_case";
import { CreateTagUseCase } from "../../application/usecases/actions/create_tag_use_case";
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
import { RepositoryReleasePublicationRepository } from "../../data/repository/release/repository_release_publication_repository";
import { RepositoryTagRepository } from "../../data/repository/release/repository_tag_repository";
import { GitCommitAdapter } from "../git_commit_adapter";
import { BoundBugbotGitMutationAdapter } from '../bound_bugbot_git_mutation_adapter';
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
import { GithubDeploymentGitRepository } from "../../data/repository/deployment/github_deployment_git_repository";
import { GithubManagedPullRequestRepository } from "../../data/repository/deployment/github_managed_pull_request_repository";
import { GithubTargetMergeCapabilitiesInspector } from "../../data/repository/deployment/github_target_merge_capabilities_inspector";
import { DeploymentContinuationRepository } from "../../data/repository/deployment/deployment_continuation_repository";
import { DeploymentPresentationRepository } from "../../data/repository/deployment/deployment_presentation_repository";
import { DeploymentStateRepositoryFactory } from "../../data/repository/deployment/deployment_state_repository";
import { OctokitDeploymentClientAdapter } from "../github/octokit_deployment_adapter";
import { WorkflowDispatchRepository } from "../../data/repository/workflow/workflow_dispatch_repository";
import { createWorkflowDispatchClient } from "./github_workflow_client_factory";
import { randomUUID } from "node:crypto";
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import type { Execution } from '../../data/model/execution';

function createDetectPotentialProblemsUseCase(binding: BugbotScmBinding): DetectPotentialProblemsUseCase {
  const bugbot = createBugbotCompositionRoot(binding);
  return new DetectPotentialProblemsUseCase(
    createFindingsQueryPort(),
    bugbot.scm,
    bugbot.telemetry,
  );
}

export type MainRunCompositionSurface = "github-workflow" | "local";

export function createSingleActionUseCaseCompositionRoot(
  surface: MainRunCompositionSurface,
  binding: BugbotScmBinding,
): SingleActionUseCase {
  const issueDescriptionQueryPort = createIssueContentCompositionRoot();
  const repositoryTagPort = surface === "github-workflow"
    ? new RepositoryTagRepository(createReleaseClient())
    : undefined;
  const repositoryReleasePort = surface === "github-workflow"
    ? new RepositoryReleasePublicationRepository(createReleaseClient())
    : undefined;
  const deploymentOrchestration = surface === "github-workflow"
    ? createDeploymentOrchestrationUseCase(issueDescriptionQueryPort, repositoryReleasePort!)
    : undefined;
  return new SingleActionUseCase(
    repositoryTagPort && repositoryReleasePort
      ? new PublishGithubActionUseCase(repositoryTagPort, repositoryReleasePort)
      : undefined,
    repositoryReleasePort ? new CreateReleaseUseCase(repositoryReleasePort) : undefined,
    repositoryTagPort ? new CreateTagUseCase(repositoryTagPort) : undefined,
    new ThinkUseCase(
      issueDescriptionQueryPort,
      createIssueNotificationRepository(),
      createFindingsQueryPort(),
    ),
    createInitialSetupCompositionRoot(),
    createCheckProgressCompositionRoot(),
    createDetectPotentialProblemsUseCase(binding),
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

function createDeploymentOrchestrationUseCase(
  issueDescriptionQueryPort: ReturnType<typeof createIssueContentCompositionRoot>,
  publication: RepositoryReleasePublicationRepository,
): DeploymentOrchestrationUseCase {
  const deploymentClient = new OctokitDeploymentClientAdapter();
  return new DeploymentOrchestrationUseCase({
    pullRequests: new GithubManagedPullRequestRepository(deploymentClient),
    targetRules: new GithubTargetMergeCapabilitiesInspector(deploymentClient),
    git: new GithubDeploymentGitRepository(deploymentClient),
    continuation: new DeploymentContinuationRepository(
      new WorkflowDispatchRepository(createWorkflowDispatchClient()),
    ),
    presentation: new DeploymentPresentationRepository(issueDescriptionQueryPort),
    publication,
    state: new DeploymentStateRepositoryFactory(issueDescriptionQueryPort),
    labels: createIssueLabelRepository(),
    issues: createIssueClosureRepository(),
    operationId: randomUUID,
  });
}

export function createIssueCommentUseCaseCompositionRoot(binding: BugbotScmBinding): IssueCommentUseCase {
  const bugbot = createBugbotCompositionRoot(binding);
  const findings = createFindingsQueryPort();
  const language = createLanguageQueryPort();
  const fixer = createFixerQueryPort();
  const gitCommit = new GitCommitAdapter();
  const authenticatedUser = createAuthenticatedUserCompositionRoot();
  const bugbotGit = new BoundBugbotGitMutationAdapter(gitCommit, authenticatedUser, binding.token);
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
      findings,
      bugbot.scm.context,
    ),
    new ThinkUseCase(
      createIssueContentCompositionRoot(),
      createIssueNotificationRepository(),
      findings,
    ),
    new BugbotAutofixUseCase(fixer, bugbot.scm.context, bugbotGit),
    new DoUserRequestUseCase(fixer, gitCommit),
    createActorAuthorizationRepository(),
    gitCommit,
    bugbotGit,
    new DismissBugbotFindingsUseCase({ contextPorts: bugbot.scm.context, resolutionPorts: bugbot.scm.resolution }),
    new DetectPotentialProblemsUseCase(findings, bugbot.scm, bugbot.telemetry),
    pullRequestDescription,
    new RememberBugbotRuleUseCase(bugbot.rules),
    branchSync,
  );
}

export function createPullRequestReviewCommentUseCaseCompositionRoot(binding: BugbotScmBinding): PullRequestReviewCommentUseCase {
  const bugbot = createBugbotCompositionRoot(binding);
  const findings = createFindingsQueryPort();
  const language = createLanguageQueryPort();
  const fixer = createFixerQueryPort();
  const gitCommit = new GitCommitAdapter();
  const authenticatedUser = createAuthenticatedUserCompositionRoot();
  const bugbotGit = new BoundBugbotGitMutationAdapter(gitCommit, authenticatedUser, binding.token);
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
      findings,
      bugbot.scm.context,
    ),
    new ThinkUseCase(
      createIssueContentCompositionRoot(),
      createIssueNotificationRepository(),
      findings,
    ),
    new BugbotAutofixUseCase(fixer, bugbot.scm.context, bugbotGit),
    new DoUserRequestUseCase(fixer, gitCommit),
    createActorAuthorizationRepository(),
    gitCommit,
    bugbotGit,
    new DismissBugbotFindingsUseCase({ contextPorts: bugbot.scm.context, resolutionPorts: bugbot.scm.resolution }),
    new DetectPotentialProblemsUseCase(findings, bugbot.scm, bugbot.telemetry),
    pullRequestDescription,
    new RememberBugbotRuleUseCase(bugbot.rules),
    branchSync,
  );
}

export function createCommitUseCaseCompositionRoot(
  projectBoardCommandPort: ProjectBoardCommandPort,
  binding: BugbotScmBinding,
): CommitUseCase {
  return new CommitUseCase(
    new NotifyNewCommitOnIssueUseCase(createIssueNotificationRepository()),
    new CheckChangesIssueSizeUseCase(
      projectBoardCommandPort,
      createIssueLabelRepository(),
      new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
      new BranchCompareRepository(createBranchComparisonClient()),
    ),
    createDetectPotentialProblemsUseCase(binding),
    createCheckProgressCompositionRoot(),
    createActorAuthorizationRepository(),
  );
}

export function createMainRunRouteCompositionRoot(
  projectBoardCommandPort: ProjectBoardCommandPort,
  surface: MainRunCompositionSurface,
): MainRunRouteHandlers {
  // Composition is scoped to one main run. Each route is built only when it is
  // actually selected, while repeated calls in the same run reuse its graph.
  const singleAction = lazyWith((execution: Execution) =>
    createSingleActionUseCaseCompositionRoot(surface, bugbotBinding(execution)));
  const issueComment = lazyWith((execution: Execution) =>
    createIssueCommentUseCaseCompositionRoot(bugbotBinding(execution)));
  const issue = lazy(() => createIssueUseCaseCompositionRoot());
  const pullRequestReviewComment = lazyWith((execution: Execution) =>
    createPullRequestReviewCommentUseCaseCompositionRoot(bugbotBinding(execution)));
  const pullRequest = lazyWith((execution: Execution) =>
    createPullRequestUseCaseCompositionRoot(bugbotBinding(execution)));
  const push = lazyWith((execution: Execution) =>
    createCommitUseCaseCompositionRoot(projectBoardCommandPort, bugbotBinding(execution)));

  return {
    "single-action": async (execution) =>
      singleAction(execution).invoke(execution),
    "issue-comment": async (execution) =>
      issueComment(execution).invoke(execution),
    issue: async (execution) =>
      issue().invoke(execution),
    "pull-request-review-comment": async (execution) =>
      pullRequestReviewComment(execution).invoke(execution),
    "pull-request": async (execution) =>
      pullRequest(execution).invoke(execution),
    push: async (execution) =>
      push(execution).invoke(execution),
  };
}

function lazy<T>(factory: () => T): () => T {
  let value: T | undefined;
  return () => value ?? (value = factory());
}

function lazyWith<T, TArg>(factory: (arg: TArg) => T): (arg: TArg) => T {
  let value: T | undefined;
  return (arg) => value ?? (value = factory(arg));
}

function bugbotBinding(execution: Execution): BugbotScmBinding {
  return {
    owner: execution.owner,
    repository: execution.repo,
    token: execution.tokens.token,
  };
}
