import { CommitUseCase } from "../../application/usecases/commit_use_case";
import { IssueCommentUseCase } from "../../application/usecases/issue_comment_use_case";
import type { ProjectBoardCommandPort } from "../../application/ports/project_board_command_ports";
import { PullRequestReviewCommentUseCase } from "../../application/usecases/pull_request_review_comment_use_case";
import { SingleActionUseCase } from "../../application/usecases/single_action_use_case";
import type { MainRunRouteHandlers } from "../../actions/main_run_route_handlers";
import { CreateReleaseUseCase } from "../../application/usecases/actions/create_release_use_case";
import { CreateTagUseCase } from "../../application/usecases/actions/create_tag_use_case";
import { DeployedActionUseCase } from "../../application/usecases/actions/deployed_action_use_case";
import { PublishGithubActionUseCase } from "../../application/usecases/actions/publish_github_action_use_case";
import { RecommendStepsUseCase } from "../../application/usecases/actions/recommend_steps_use_case";
import { CheckChangesIssueSizeUseCase } from "../../application/usecases/steps/commit/check_changes_issue_size_use_case";
import { BugbotAutofixUseCase } from "../../application/usecases/steps/commit/bugbot/bugbot_autofix_use_case";
import { DetectBugbotFixIntentUseCase } from "../../application/usecases/steps/commit/bugbot/detect_bugbot_fix_intent_use_case";
import { DetectPotentialProblemsUseCase } from "../../application/usecases/steps/commit/detect_potential_problems_use_case";
import { NotifyNewCommitOnIssueUseCase } from "../../application/usecases/steps/commit/notify_new_commit_on_issue_use_case";
import { DoUserRequestUseCase } from "../../application/usecases/steps/commit/user_request_use_case";
import { ThinkUseCase } from "../../application/usecases/steps/common/think_use_case";
import { CheckIssueCommentLanguageUseCase } from "../../application/usecases/steps/issue_comment/check_issue_comment_language_use_case";
import { CheckPullRequestCommentLanguageUseCase } from "../../application/usecases/steps/pull_request_review_comment/check_pull_request_comment_language_use_case";
import { BranchCompareRepository } from "../../data/repository/branch_compare_repository";
import { MergeRepository } from "../../data/repository/merge_repository";
import { PullRequestLifecycleRepository } from "../../data/repository/pull_request/pull_request_lifecycle_repository";
import { RepositoryReleasePublicationRepository } from "../../data/repository/release/repository_release_publication_repository";
import { RepositoryTagRepository } from "../../data/repository/release/repository_tag_repository";
import { GitCommitAdapter } from "../git_commit_adapter";
import { createActorAuthorizationRepository } from "./actor_authorization_composition_root";
import {
  createFindingsQueryPort,
  createFixerQueryPort,
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

function createDetectPotentialProblemsUseCase(): DetectPotentialProblemsUseCase {
  const bugbot = createBugbotCompositionRoot();
  return new DetectPotentialProblemsUseCase(
    createFindingsQueryPort(),
    bugbot.context,
    bugbot.publication,
    bugbot.resolution,
  );
}

export function createSingleActionUseCaseCompositionRoot(): SingleActionUseCase {
  const repositoryTagPort = new RepositoryTagRepository(createReleaseClient());
  const repositoryReleasePort = new RepositoryReleasePublicationRepository(
    createReleaseClient(),
  );
  const issueDescriptionQueryPort = createIssueContentCompositionRoot();
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
  );
}

export function createIssueCommentUseCaseCompositionRoot(): IssueCommentUseCase {
  const bugbot = createBugbotCompositionRoot();
  const findings = createFindingsQueryPort();
  const fixer = createFixerQueryPort();
  const gitCommit = new GitCommitAdapter();

  return new IssueCommentUseCase(
    new CheckIssueCommentLanguageUseCase(bugbot.issue, findings),
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
    new DoUserRequestUseCase(fixer),
    bugbot.issue,
    createActorAuthorizationRepository(),
    createAuthenticatedUserCompositionRoot(),
    bugbot.resolution,
    gitCommit,
  );
}

export function createPullRequestReviewCommentUseCaseCompositionRoot(): PullRequestReviewCommentUseCase {
  const bugbot = createBugbotCompositionRoot();
  const findings = createFindingsQueryPort();
  const fixer = createFixerQueryPort();
  const gitCommit = new GitCommitAdapter();

  return new PullRequestReviewCommentUseCase(
    new CheckPullRequestCommentLanguageUseCase(bugbot.issue, findings),
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
    new DoUserRequestUseCase(fixer),
    bugbot.issue,
    createActorAuthorizationRepository(),
    createAuthenticatedUserCompositionRoot(),
    bugbot.resolution,
    gitCommit,
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
  );
}

export function createMainRunRouteCompositionRoot(
  projectBoardCommandPort: ProjectBoardCommandPort,
): MainRunRouteHandlers {
  return {
    "single-action": async (execution) =>
      createSingleActionUseCaseCompositionRoot().invoke(execution),
    "issue-comment": async (execution) =>
      createIssueCommentUseCaseCompositionRoot().invoke(execution),
    issue: async (execution) =>
      createIssueUseCaseCompositionRoot().invoke(execution),
    "pull-request-review-comment": async (execution) =>
      createPullRequestReviewCommentUseCaseCompositionRoot().invoke(execution),
    "pull-request": async (execution) =>
      createPullRequestUseCaseCompositionRoot().invoke(execution),
    push: async (execution) =>
      createCommitUseCaseCompositionRoot(projectBoardCommandPort).invoke(
        execution,
      ),
  };
}
