import { IssueCommentUseCase } from "../../../application/usecases/issue_comment_use_case";
import { CommitUseCase } from "../../../application/usecases/commit_use_case";
import { PullRequestReviewCommentUseCase } from "../../../application/usecases/pull_request_review_comment_use_case";
import { SingleActionUseCase } from "../../../application/usecases/single_action_use_case";
import { BugbotAutofixUseCase } from "../../../application/usecases/steps/commit/bugbot/bugbot_autofix_use_case";
import { DetectBugbotFixIntentUseCase } from "../../../application/usecases/steps/commit/bugbot/detect_bugbot_fix_intent_use_case";
import { DoUserRequestUseCase } from "../../../application/usecases/steps/commit/user_request_use_case";
import { ThinkUseCase } from "../../../application/usecases/steps/common/think_use_case";
import { CheckIssueCommentLanguageUseCase } from "../../../application/usecases/steps/issue_comment/check_issue_comment_language_use_case";
import { GitCommitAdapter } from "../../git_commit_adapter";
import type { ProjectBoardCommandPort } from "../../../application/ports/project_board_command_ports";
import type { Execution } from "../../../data/model/execution";
import {
  createIssueCommentUseCaseCompositionRoot,
  createMainRunRouteCompositionRoot,
  createPullRequestReviewCommentUseCaseCompositionRoot,
} from "../main_run_route_composition_root";

const mockIssue = {};
const mockPullRequest = {};
const mockContext = { pullRequest: mockPullRequest };
const mockResolution = { kind: "resolution" };
const mockFindings = {};
const mockLanguage = {};
const mockFixer = {};
const mockIssueInvoke = jest.fn();
const mockPullRequestInvoke = jest.fn();

jest.mock("../bugbot_composition_root", () => ({
  createBugbotCompositionRoot: jest.fn(() => ({
    issue: mockIssue,
    pullRequest: mockPullRequest,
    context: mockContext,
    resolution: mockResolution,
    write: {},
  })),
}));

jest.mock("../agent_capability_composition_root", () => ({
  createFindingsQueryPort: jest.fn(() => mockFindings),
  createFixerQueryPort: jest.fn(() => mockFixer),
  createLanguageQueryPort: jest.fn(() => mockLanguage),
}));

jest.mock("../issue_use_case_composition_root", () => ({
  createIssueUseCaseCompositionRoot: jest.fn(() => ({
    invoke: mockIssueInvoke,
  })),
}));

jest.mock("../pull_request_use_case_composition_root", () => ({
  createPullRequestUseCaseCompositionRoot: jest.fn(() => ({
    invoke: mockPullRequestInvoke,
  })),
}));

jest.mock("../../../application/usecases/commit_use_case");
jest.mock("../../../application/usecases/issue_comment_use_case");
jest.mock("../../../application/usecases/pull_request_review_comment_use_case");
jest.mock("../../../application/usecases/single_action_use_case");
jest.mock(
  "../../../application/usecases/steps/commit/bugbot/bugbot_autofix_use_case",
);
jest.mock(
  "../../../application/usecases/steps/commit/bugbot/detect_bugbot_fix_intent_use_case",
);
jest.mock("../../../application/usecases/steps/commit/user_request_use_case");
jest.mock("../../../application/usecases/steps/common/think_use_case");
jest.mock(
  "../../../application/usecases/steps/issue_comment/check_issue_comment_language_use_case",
);
jest.mock("../../git_commit_adapter");

describe("main run route composition root", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shares route-scoped Bugbot, agent, and Git commit capabilities", () => {
    const useCase = createIssueCommentUseCaseCompositionRoot();

    expect(useCase).toBeInstanceOf(IssueCommentUseCase);
    expect(CheckIssueCommentLanguageUseCase).toHaveBeenCalledWith(
      expect.objectContaining({
        commentRepository: mockIssue,
        languageQueryPort: mockLanguage,
      }),
    );
    expect(DetectBugbotFixIntentUseCase).toHaveBeenCalledWith(
      mockPullRequest,
      mockFindings,
      mockContext,
    );
    expect(ThinkUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      mockFindings,
    );

    const gitCommit = (
      GitCommitAdapter as jest.MockedClass<typeof GitCommitAdapter>
    ).mock.instances[0];
    expect(GitCommitAdapter).toHaveBeenCalledTimes(1);
    expect(BugbotAutofixUseCase).toHaveBeenCalledWith(
      mockFixer,
      mockContext,
      gitCommit,
    );
    expect(DoUserRequestUseCase).toHaveBeenCalledWith(mockFixer);
    expect(IssueCommentUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      mockIssue,
      expect.anything(),
      expect.anything(),
      mockResolution,
      gitCommit,
      expect.anything(),
      expect.anything(),
    );
  });

  it("injects the narrow Bugbot resolution view into review comments", () => {
    const useCase = createPullRequestReviewCommentUseCaseCompositionRoot();

    expect(useCase).toBeInstanceOf(PullRequestReviewCommentUseCase);
    expect(PullRequestReviewCommentUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      mockIssue,
      expect.anything(),
      expect.anything(),
      mockResolution,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("exposes one handler for every executable route", () => {
    const handlers = createMainRunRouteCompositionRoot(
      {} as ProjectBoardCommandPort,
    );

    expect(Object.keys(handlers).sort()).toEqual(
      [
        "issue",
        "issue-comment",
        "pull-request",
        "pull-request-review-comment",
        "push",
        "single-action",
      ].sort(),
    );
    Object.values(handlers).forEach((handler) =>
      expect(handler).toEqual(expect.any(Function)),
    );
  });

  it("binds every route to its matching use case", async () => {
    const execution = {} as Execution;
    const handlers = createMainRunRouteCompositionRoot(
      {} as ProjectBoardCommandPort,
    );

    await handlers["single-action"](execution);
    const singleAction = (
      SingleActionUseCase as jest.MockedClass<typeof SingleActionUseCase>
    ).mock.instances[0];
    expect(singleAction.invoke).toHaveBeenCalledWith(execution);

    await handlers["issue-comment"](execution);
    const issueCommentInstances = (
      IssueCommentUseCase as jest.MockedClass<typeof IssueCommentUseCase>
    ).mock.instances;
    expect(
      issueCommentInstances[issueCommentInstances.length - 1].invoke,
    ).toHaveBeenCalledWith(execution);

    await handlers.issue(execution);
    expect(mockIssueInvoke).toHaveBeenCalledWith(execution);

    await handlers["pull-request-review-comment"](execution);
    const reviewComment = (
      PullRequestReviewCommentUseCase as jest.MockedClass<
        typeof PullRequestReviewCommentUseCase
      >
    ).mock.instances[0];
    expect(reviewComment.invoke).toHaveBeenCalledWith(execution);

    await handlers["pull-request"](execution);
    expect(mockPullRequestInvoke).toHaveBeenCalledWith(execution);

    await handlers.push(execution);
    const commit = (CommitUseCase as jest.MockedClass<typeof CommitUseCase>)
      .mock.instances[0];
    expect(commit.invoke).toHaveBeenCalledWith(execution);
  });
});
