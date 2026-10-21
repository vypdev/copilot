import { IssueCommentUseCase } from "../../../application/usecases/issue_comment_use_case";
import { CommitUseCase } from "../../../application/usecases/commit_use_case";
import { PullRequestReviewCommentUseCase } from "../../../application/usecases/pull_request_review_comment_use_case";
import { SingleActionUseCase } from "../../../application/usecases/single_action_use_case";
import { BugbotAutofixUseCase } from "../../../application/usecases/steps/commit/bugbot/bugbot_autofix_use_case";
import { DetectBugbotFixIntentUseCase } from "../../../application/usecases/steps/commit/bugbot/detect_bugbot_fix_intent_use_case";
import { DoUserRequestUseCase } from "../../../application/usecases/steps/commit/user_request_use_case";
import { ThinkUseCase } from "../../../application/usecases/steps/common/think_use_case";
import { RememberBugbotRuleUseCase } from "../../../application/usecases/steps/commit/bugbot/remember_bugbot_rule_use_case";
import { CheckIssueCommentLanguageUseCase } from "../../../application/usecases/steps/issue_comment/check_issue_comment_language_use_case";
import { GitCommitAdapter } from "../../git_commit_adapter";
import { captureVerificationSetup } from '../../verification_setup_snapshot';
import type { ProjectBoardCommandPort } from "../../../application/ports/project_board_command_ports";
import type { Execution } from "../../../data/model/execution";
import {
  createIssueCommentUseCaseCompositionRoot,
  createMainRunRouteCompositionRoot,
  createPullRequestReviewCommentUseCaseCompositionRoot,
} from "../main_run_route_composition_root";

const mockIssue = {};
const mockPullRequest = {};
const mockContext = { kind: 'context', listIssueComments: jest.fn() };
const mockStatusReadPorts = { kind: 'status-read-ports' };
jest.mock('../pull_request_status_composition_root', () => ({ createPullRequestStatusReadPorts: jest.fn(() => mockStatusReadPorts) }));
const mockResolution = { kind: "resolution" };
const mockFindings = {};
const mockLanguage = {};
const mockFixer = {};
const mockRules = {};
const mockIssueComments = {};
const mockScm = {
  context: mockContext,
  resolution: mockResolution,
  publication: { kind: 'publication', issueComments: mockIssueComments },
  reconciliation: { snapshot: {}, presentation: {} },
};
const binding = { owner: 'owner', repository: 'repo', token: 'token' };
const mockIssueInvoke = jest.fn();
const mockPullRequestInvoke = jest.fn();

jest.mock("../bugbot_composition_root", () => ({
  createBugbotCompositionRoot: jest.fn(() => ({
    issue: mockIssue,
    scm: mockScm,
    rules: mockRules,
    telemetry: {},
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
  "../../../application/usecases/steps/commit/bugbot/remember_bugbot_rule_use_case",
);
jest.mock(
  "../../../application/usecases/steps/issue_comment/check_issue_comment_language_use_case",
);
jest.mock("../../git_commit_adapter");
jest.mock('../../verification_setup_snapshot', () => ({ captureVerificationSetup: jest.fn(() => ({ kind: 'disabled' })) }));

describe("main run route composition root", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['issue-comment', 'pull-request-review-comment'] as const)('captures trusted setup before %s can invoke an agent', async route => {
    const snapshot = { kind: 'blocked', reason: 'source-unavailable' } as const;
    jest.mocked(captureVerificationSetup).mockReturnValueOnce(snapshot);
    const execution = { owner: 'owner', repo: 'repo', tokens: { token: 'token' }, branches: { main: 'production' }, verificationSetup: true } as Execution;
    const handlers = createMainRunRouteCompositionRoot({} as ProjectBoardCommandPort, 'local');
    await handlers[route](execution);
    expect(captureVerificationSetup).toHaveBeenCalledWith(true, 'production');
    expect(GitCommitAdapter).toHaveBeenCalledWith(undefined, undefined, snapshot);
    const useCase = route === 'issue-comment' ? jest.mocked(IssueCommentUseCase).mock.instances[0] : jest.mocked(PullRequestReviewCommentUseCase).mock.instances[0];
    expect(jest.mocked(captureVerificationSetup).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(useCase.invoke).mock.invocationCallOrder[0]);
  });

  it("shares route-scoped Bugbot, agent, and Git commit capabilities", () => {
    const useCase = createIssueCommentUseCaseCompositionRoot(binding);

    expect(useCase).toBeInstanceOf(IssueCommentUseCase);
    expect(CheckIssueCommentLanguageUseCase).toHaveBeenCalledWith(
      expect.objectContaining({ languageQueryPort: mockLanguage }),
    );
    expect(DetectBugbotFixIntentUseCase).toHaveBeenCalledWith(
      mockFindings,
      mockContext,
    );
    expect(ThinkUseCase).toHaveBeenCalledWith(
      expect.anything(),
      mockFindings,
    );

    expect(GitCommitAdapter).toHaveBeenCalledTimes(1);
    expect(BugbotAutofixUseCase).toHaveBeenCalledWith(
      mockFixer,
      mockContext,
      expect.anything(),
    );
    expect(DoUserRequestUseCase).toHaveBeenCalledWith(mockFixer, expect.objectContaining({
      execute: expect.any(Function),
      fetch: expect.any(Function),
      getAuthenticatedUserDetails: expect.any(Function),
    }));
    expect(RememberBugbotRuleUseCase).toHaveBeenCalledWith(mockRules);
    expect(IssueCommentUseCase).toHaveBeenCalledTimes(1);
    const call = jest.mocked(IssueCommentUseCase).mock.calls[0];
    expect(call.slice(0, 15)).toEqual([
      ...Array.from({ length: 14 }, () => expect.anything()), mockStatusReadPorts,
    ]);
    const historyPort = call[15];
    expect(historyPort).toEqual(expect.objectContaining({
      readComments: expect.any(Function),
      serverOrigin: expect.any(String),
    }));
    expect(Object.keys(historyPort!)).toEqual(['serverOrigin', 'readComments']);
    expect(Object.isFrozen(historyPort)).toBe(true);
    const sddQuery = call[16];
    expect(sddQuery).toEqual(expect.objectContaining({
      read: expect.any(Function),
      serverOrigin: expect.any(String),
    }));
    expect(Object.keys(sddQuery!)).toEqual(['read', 'serverOrigin']);
    expect(Object.isFrozen(sddQuery)).toBe(true);
    const diff = call[17];
    expect(Object.keys(diff!).sort()).toEqual(['read', 'serverOrigin']);
    expect(Object.isFrozen(diff)).toBe(true);
    const doctor = call.find(value => value && typeof value === 'object' && 'readRepository' in value && 'readLinkedBranch' in value);
    expect(doctor).toMatchObject({
      readRepository: expect.any(Function),
      readApprovalPolicy: expect.any(Function),
      pullRequests: expect.objectContaining({
        getPullRequest: expect.any(Function),
        getPullRequestHeadSha: expect.any(Function),
      }),
    });
  });

  it("keeps Bugbot resolution out of the review-comment autofix composition", () => {
    const useCase = createPullRequestReviewCommentUseCaseCompositionRoot(binding);

    expect(useCase).toBeInstanceOf(PullRequestReviewCommentUseCase);
    expect(PullRequestReviewCommentUseCase).toHaveBeenCalledTimes(1);
    const call = jest.mocked(PullRequestReviewCommentUseCase).mock.calls[0];
    expect(call.slice(0, 14)).toEqual([
      ...Array.from({ length: 13 }, () => expect.anything()), mockStatusReadPorts,
    ]);
    const doctor = call.find(value => value && typeof value === 'object' && 'readRepository' in value && 'readLinkedBranch' in value);
    expect(doctor).toMatchObject({
      readRepository: expect.any(Function),
      readApprovalPolicy: expect.any(Function),
      pullRequests: expect.objectContaining({
        getPullRequest: expect.any(Function),
        getPullRequestHeadSha: expect.any(Function),
      }),
    });
    const historyPort = jest.mocked(PullRequestReviewCommentUseCase).mock.calls[0][14];
    expect(historyPort).toMatchObject({ readComments: expect.any(Function) });
    expect(Object.keys(historyPort!)).toEqual(['serverOrigin', 'readComments']);
    expect(Object.isFrozen(historyPort)).toBe(true);
  });

  it("exposes one handler for every executable route", () => {
    const handlers = createMainRunRouteCompositionRoot(
      {} as ProjectBoardCommandPort,
      "local",
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
    const execution = {
      owner: 'owner',
      repo: 'repo',
      tokens: { token: 'token' },
      branches: { main: 'master' },
      verificationSetup: false,
    } as Execution;
    const handlers = createMainRunRouteCompositionRoot(
      {} as ProjectBoardCommandPort,
      "local",
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

    await handlers["single-action"](execution);
    await handlers["issue-comment"](execution);
    await handlers.issue(execution);
    await handlers["pull-request-review-comment"](execution);
    await handlers["pull-request"](execution);
    await handlers.push(execution);

    expect(SingleActionUseCase).toHaveBeenCalledTimes(1);
    expect(IssueCommentUseCase).toHaveBeenCalledTimes(1);
    expect(PullRequestReviewCommentUseCase).toHaveBeenCalledTimes(1);
    expect(CommitUseCase).toHaveBeenCalledTimes(1);
    expect(mockIssueInvoke).toHaveBeenCalledTimes(2);
    expect(mockPullRequestInvoke).toHaveBeenCalledTimes(2);
  });
});
