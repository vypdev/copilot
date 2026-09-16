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
import { ResolveMessageCatalogUseCase } from '../../application/usecases/localization/resolve_message_catalog_use_case';
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import {
  bindIssueDescriptionQuery,
  bindOrganizationMembers,
} from './shared_capability_port_binding';
import { bindPullRequestDescription } from './lifecycle_capability_port_binding';
import { bindIssueLabels, bindProjectBoardCommands } from './lifecycle_capability_port_binding';
import {
  bindAuthenticatedUser,
  bindBranchChangeSize,
  bindBranchComparison,
  bindBranchDependencies,
  bindBranchSyncWorkspace,
  bindDeploymentContinuation,
  bindDeploymentGit,
  bindDeploymentIssues,
  bindDeploymentLabels,
  bindDeploymentPresentation,
  bindDeploymentPublicationReceipt,
  bindDeploymentState,
  bindDeploymentTargetRules,
  bindIssueCommentPublication,
  bindIssueReopen,
  bindManagedPullRequests,
  bindPullRequestBranchQuery,
  bindRepositoryRelease,
  bindRepositoryTag,
} from './push_single_action_capability_port_binding';

function createDetectPotentialProblemsUseCase(binding: BugbotScmBinding): DetectPotentialProblemsUseCase {
  const bugbot = createBugbotCompositionRoot(binding);
  return new DetectPotentialProblemsUseCase(
    createFindingsQueryPort(),
    bugbot.scm,
    bugbot.telemetry,
    new ResolveMessageCatalogUseCase(createLanguageQueryPort()),
  );
}

export type MainRunCompositionSurface = "github-workflow" | "local";

export function createSingleActionUseCaseCompositionRoot(
  surface: MainRunCompositionSurface,
  binding: BugbotScmBinding,
): SingleActionUseCase {
  const catalogResolver = new ResolveMessageCatalogUseCase(createLanguageQueryPort());
  const issueDescriptionQueryPort = createIssueContentCompositionRoot();
  const repositoryTagPort = surface === "github-workflow"
    ? new RepositoryTagRepository(createReleaseClient())
    : undefined;
  const repositoryReleasePort = surface === "github-workflow"
    ? new RepositoryReleasePublicationRepository(createReleaseClient())
    : undefined;
  const deploymentOrchestration = surface === "github-workflow"
    ? createDeploymentOrchestrationUseCase(issueDescriptionQueryPort, repositoryReleasePort!, binding, catalogResolver)
    : undefined;
  return new SingleActionUseCase(
    repositoryTagPort && repositoryReleasePort
      ? new PublishGithubActionUseCase(bindRepositoryTag(repositoryTagPort, binding), bindRepositoryRelease(repositoryReleasePort, binding))
      : undefined,
    repositoryReleasePort ? new CreateReleaseUseCase(bindRepositoryRelease(repositoryReleasePort, binding)) : undefined,
    repositoryTagPort ? new CreateTagUseCase(bindRepositoryTag(repositoryTagPort, binding)) : undefined,
    new ThinkUseCase(
      bindIssueDescriptionQuery(issueDescriptionQueryPort, binding),
      createFindingsQueryPort(),
    ),
    createInitialSetupCompositionRoot(binding),
    createCheckProgressCompositionRoot(binding),
    createDetectPotentialProblemsUseCase(binding),
    new RecommendStepsUseCase(
      bindIssueDescriptionQuery(issueDescriptionQueryPort, binding),
      createFindingsQueryPort(),
    ),
    createCloseInactiveIssuesUseCase(binding, catalogResolver),
    createActorAuthorizationRepository(),
    new PublishIssueCommentUseCase(bindIssueCommentPublication(issueDescriptionQueryPort, binding)),
    new ObserveBranchSyncUseCase(
      bindBranchDependencies(new BranchDependencyRepository(createGraphqlTransportClient()), binding),
      bindBranchComparison(new BranchCompareRepository(createBranchComparisonClient()), binding),
      bindIssueCommentPublication(issueDescriptionQueryPort, binding),
      catalogResolver,
    ),
    deploymentOrchestration,
  );
}

function createDeploymentOrchestrationUseCase(
  issueDescriptionQueryPort: ReturnType<typeof createIssueContentCompositionRoot>,
  publication: RepositoryReleasePublicationRepository,
  binding: BugbotScmBinding,
  catalogResolver: ResolveMessageCatalogUseCase,
): DeploymentOrchestrationUseCase {
  const deploymentClient = new OctokitDeploymentClientAdapter();
  return new DeploymentOrchestrationUseCase({
    pullRequests: bindManagedPullRequests(new GithubManagedPullRequestRepository(deploymentClient), binding),
    targetRules: bindDeploymentTargetRules(new GithubTargetMergeCapabilitiesInspector(deploymentClient), binding),
    git: bindDeploymentGit(new GithubDeploymentGitRepository(deploymentClient), binding),
    continuation: bindDeploymentContinuation(new DeploymentContinuationRepository(
      new WorkflowDispatchRepository(createWorkflowDispatchClient()),
    ), binding),
    presentation: bindDeploymentPresentation(new DeploymentPresentationRepository(issueDescriptionQueryPort), binding),
    publication: bindDeploymentPublicationReceipt(publication, binding),
    state: bindDeploymentState(new DeploymentStateRepositoryFactory(issueDescriptionQueryPort), binding),
    labels: bindDeploymentLabels(createIssueLabelRepository(), binding),
    issues: bindDeploymentIssues(createIssueClosureRepository(), binding),
    operationId: randomUUID,
    catalogResolver,
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
    bindPullRequestDescription(new PullRequestLifecycleRepository(createPullRequestLifecycleClient()), binding),
    bindIssueDescriptionQuery(createIssueContentCompositionRoot(), binding),
    bindOrganizationMembers(createOrganizationMembersCompositionRoot(), binding),
    createFindingsQueryPort(),
  );
  const branchSync = new SyncBranchUseCase(
    bindBranchDependencies(new BranchDependencyRepository(createGraphqlTransportClient()), binding),
    bindBranchSyncWorkspace(new BranchSyncWorkspaceAdapter(gitCommit), binding),
    fixer,
    bindAuthenticatedUser(authenticatedUser, binding),
    bugbotGit,
  );

  return new IssueCommentUseCase(
    new CheckIssueCommentLanguageUseCase(
      new CommentLanguageTranslationWorkflow(language),
    ),
    new DetectBugbotFixIntentUseCase(
      findings,
      bugbot.scm.context,
    ),
    new ThinkUseCase(
      bindIssueDescriptionQuery(createIssueContentCompositionRoot(), binding),
      findings,
    ),
    new BugbotAutofixUseCase(fixer, bugbot.scm.context, bugbotGit),
    new DoUserRequestUseCase(fixer, bugbotGit),
    createActorAuthorizationRepository(),
    bugbotGit,
    new DismissBugbotFindingsUseCase({
      contextPorts: bugbot.scm.context,
      resolutionPorts: bugbot.scm.resolution,
      catalogResolver: new ResolveMessageCatalogUseCase(language),
    }),
    new DetectPotentialProblemsUseCase(
      findings,
      bugbot.scm,
      bugbot.telemetry,
      new ResolveMessageCatalogUseCase(language),
    ),
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
    bindPullRequestDescription(new PullRequestLifecycleRepository(createPullRequestLifecycleClient()), binding),
    bindIssueDescriptionQuery(createIssueContentCompositionRoot(), binding),
    bindOrganizationMembers(createOrganizationMembersCompositionRoot(), binding),
    createFindingsQueryPort(),
  );
  const branchSync = new SyncBranchUseCase(
    bindBranchDependencies(new BranchDependencyRepository(createGraphqlTransportClient()), binding),
    bindBranchSyncWorkspace(new BranchSyncWorkspaceAdapter(gitCommit), binding),
    fixer,
    bindAuthenticatedUser(authenticatedUser, binding),
    bugbotGit,
  );

  return new PullRequestReviewCommentUseCase(
    new CheckPullRequestCommentLanguageUseCase(
      new CommentLanguageTranslationWorkflow(language),
    ),
    new DetectBugbotFixIntentUseCase(
      findings,
      bugbot.scm.context,
    ),
    new ThinkUseCase(
      bindIssueDescriptionQuery(createIssueContentCompositionRoot(), binding),
      findings,
    ),
    new BugbotAutofixUseCase(fixer, bugbot.scm.context, bugbotGit),
    new DoUserRequestUseCase(fixer, bugbotGit),
    createActorAuthorizationRepository(),
    bugbotGit,
    new DismissBugbotFindingsUseCase({
      contextPorts: bugbot.scm.context,
      resolutionPorts: bugbot.scm.resolution,
      catalogResolver: new ResolveMessageCatalogUseCase(language),
    }),
    new DetectPotentialProblemsUseCase(
      findings,
      bugbot.scm,
      bugbot.telemetry,
      new ResolveMessageCatalogUseCase(language),
    ),
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
    new NotifyNewCommitOnIssueUseCase(bindIssueReopen(createIssueNotificationRepository(), binding)),
    new CheckChangesIssueSizeUseCase(
      bindProjectBoardCommands(projectBoardCommandPort, binding),
      bindIssueLabels(createIssueLabelRepository(), binding),
      bindPullRequestBranchQuery(new PullRequestLifecycleRepository(createPullRequestLifecycleClient()), binding),
      bindBranchChangeSize(new BranchCompareRepository(createBranchComparisonClient()), binding),
    ),
    createDetectPotentialProblemsUseCase(binding),
    createCheckProgressCompositionRoot(binding),
    createActorAuthorizationRepository(),
  );
}

export function createMainRunRouteCompositionRoot(
  projectBoardCommandPort: ProjectBoardCommandPort,
  surface: MainRunCompositionSurface,
): MainRunRouteHandlers {
  let singleAction: SingleActionUseCase | undefined;
  let issueComment: IssueCommentUseCase | undefined;
  let issue: ReturnType<typeof createIssueUseCaseCompositionRoot> | undefined;
  let pullRequestReviewComment: PullRequestReviewCommentUseCase | undefined;
  let pullRequest: ReturnType<typeof createPullRequestUseCaseCompositionRoot> | undefined;
  let push: CommitUseCase | undefined;
  return {
    "single-action": async (execution) => {
      singleAction ??= createSingleActionUseCaseCompositionRoot(surface, bugbotBinding(execution));
      return singleAction.invoke(execution);
    },
    "issue-comment": async (execution) => {
      issueComment ??= createIssueCommentUseCaseCompositionRoot(bugbotBinding(execution));
      return issueComment.invoke(execution);
    },
    issue: async (execution) => {
      issue ??= createIssueUseCaseCompositionRoot(bugbotBinding(execution));
      return issue.invoke(execution);
    },
    "pull-request-review-comment": async (execution) => {
      pullRequestReviewComment ??= createPullRequestReviewCommentUseCaseCompositionRoot(bugbotBinding(execution));
      return pullRequestReviewComment.invoke(execution);
    },
    "pull-request": async (execution) => {
      pullRequest ??= createPullRequestUseCaseCompositionRoot(bugbotBinding(execution));
      return pullRequest.invoke(execution);
    },
    push: async (execution) => {
      push ??= createCommitUseCaseCompositionRoot(projectBoardCommandPort, bugbotBinding(execution));
      return push.invoke(execution);
    },
  };
}

function bugbotBinding(execution: {
  readonly owner: string;
  readonly repo: string;
  readonly tokens: { readonly token: string };
}): BugbotScmBinding {
  return {
    owner: execution.owner,
    repository: execution.repo,
    token: execution.tokens.token,
  };
}
