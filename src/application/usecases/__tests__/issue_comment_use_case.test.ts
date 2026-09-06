import { IssueCommentUseCase } from "../issue_comment_use_case";
import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { BugbotContext } from "../steps/commit/bugbot/types";

jest.mock("../../../utils/logger", () => ({
  logInfo: jest.fn(),
}));

const mockCheckLanguageInvoke = jest.fn();
const mockDetectIntentInvoke = jest.fn();
const mockAutofixInvoke = jest.fn();
const mockThinkInvoke = jest.fn();
const mockRunBugbotAutofixCommitAndPush = jest.fn();
const mockRunUserRequestCommitAndPush = jest.fn();
const mockMarkFindingsResolved = jest.fn();

jest.mock(
  "../steps/issue_comment/check_issue_comment_language_use_case",
  () => ({
    CheckIssueCommentLanguageUseCase: jest.fn().mockImplementation(() => ({
      invoke: mockCheckLanguageInvoke,
    })),
  }),
);

jest.mock("../steps/commit/bugbot/detect_bugbot_fix_intent_use_case", () => ({
  DetectBugbotFixIntentUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockDetectIntentInvoke,
  })),
}));

jest.mock("../steps/commit/bugbot/bugbot_autofix_use_case", () => ({
  BugbotAutofixUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockAutofixInvoke,
  })),
}));

const mockIsActorAllowedToModifyFiles = jest.fn();

jest.mock(
  "../../../data/repository/organization/actor_authorization_repository",
  () => ({
    ActorAuthorizationRepository: jest.fn().mockImplementation(() => ({
      isActorAllowedToModifyFiles: mockIsActorAllowedToModifyFiles,
    })),
  }),
);

jest.mock("../steps/commit/bugbot/bugbot_autofix_commit", () => ({
  runBugbotAutofixCommitAndPush: (...args: unknown[]) =>
    mockRunBugbotAutofixCommitAndPush(...args),
  runUserRequestCommitAndPush: (...args: unknown[]) =>
    mockRunUserRequestCommitAndPush(...args),
}));

const mockDoUserRequestInvoke = jest.fn();

jest.mock("../steps/commit/user_request_use_case", () => ({
  DoUserRequestUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockDoUserRequestInvoke,
  })),
}));

jest.mock("../steps/commit/bugbot/mark_findings_resolved_use_case", () => ({
  markFindingsResolved: (...args: unknown[]) =>
    mockMarkFindingsResolved(...args),
}));

jest.mock("../steps/common/think_use_case", () => ({
  ThinkUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockThinkInvoke,
  })),
}));

function mockContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
  return {
    existingByFindingId: {},
    issueComments: [],
    openPrNumbers: [],
    previousFindingsBlock: "",
    prContext: null,
    unresolvedFindingsWithBody: [],
    ...overrides,
  };
}

function baseExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    owner: "o",
    repo: "r",
    issueNumber: 296,
    tokens: { token: "t" },
    issue: {
      isIssueComment: true,
      isIssue: false,
      commentBody: "@bot fix it",
      number: 296,
      commentId: 42,
    },
    pullRequest: {
      isPullRequestReviewComment: false,
      commentBody: "",
      number: 0,
    },
    commit: { branch: "feature/296-bugbot-autofix" },
    singleAction: { enabledSingleAction: false } as Execution["singleAction"],
    ai: {} as Execution["ai"],
    labels: {} as Execution["labels"],
    locale: {} as Execution["locale"],
    sizeThresholds: {} as Execution["sizeThresholds"],
    branches: {} as Execution["branches"],
    release: {} as Execution["release"],
    hotfix: {} as Execution["hotfix"],
    issueTypes: {} as Execution["issueTypes"],
    workflows: {} as Execution["workflows"],
    project: {} as Execution["project"],
    currentConfiguration: {} as Execution["currentConfiguration"],
    previousConfiguration: undefined,
    tokenUser: "bot",
    inputs: undefined,
    debug: false,
    welcome: undefined,
    commitPrefixBuilder: "",
    commitPrefixBuilderParams: {},
    emoji: {} as Execution["emoji"],
    images: {} as Execution["images"],
    ...overrides,
  } as Execution;
}

describe("IssueCommentUseCase", () => {
  let useCase: IssueCommentUseCase;

  beforeEach(() => {
    useCase = new IssueCommentUseCase(
      {
        taskId: "CheckIssueCommentLanguageUseCase",
        invoke: mockCheckLanguageInvoke,
      },
      {
        taskId: "DetectBugbotFixIntentUseCase",
        invoke: mockDetectIntentInvoke,
      },
      { taskId: "ThinkUseCase", invoke: mockThinkInvoke },
      { taskId: "BugbotAutofixUseCase", invoke: mockAutofixInvoke },
      { taskId: "DoUserRequestUseCase", invoke: mockDoUserRequestInvoke },
      { updateComment: jest.fn() },
      { isActorAllowedToModifyFiles: mockIsActorAllowedToModifyFiles },
      { getUserFromToken: jest.fn(), getTokenUserDetails: jest.fn() },
      {
        execute: jest.fn(),
        configureAuthor: jest.fn(),
        stageAll: jest.fn(),
        stagePaths: jest.fn(),
        commit: jest.fn(),
        push: jest.fn(),
      },
    );
    mockIsActorAllowedToModifyFiles.mockReset().mockResolvedValue(true);
    mockCheckLanguageInvoke.mockReset().mockResolvedValue([
      new Result({
        id: "CheckIssueCommentLanguageUseCase",
        success: true,
        executed: true,
        steps: [],
      }),
    ]);
    mockDetectIntentInvoke.mockReset();
    mockAutofixInvoke.mockReset();
    mockThinkInvoke.mockReset().mockResolvedValue([
      new Result({
        id: "ThinkUseCase",
        success: true,
        executed: true,
        steps: [],
      }),
    ]);
    mockRunBugbotAutofixCommitAndPush
      .mockReset()
      .mockResolvedValue({ success: true, committed: true });
    mockRunUserRequestCommitAndPush
      .mockReset()
      .mockResolvedValue({ success: true, committed: true });
    mockMarkFindingsResolved.mockReset().mockResolvedValue([]);
    mockDoUserRequestInvoke.mockReset();
  });

  it("runs CheckIssueCommentLanguage and DetectBugbotFixIntent in order", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: false,
          isDoRequest: false,
          targetFindingIds: [],
        },
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockCheckLanguageInvoke).toHaveBeenCalledTimes(1);
    expect(mockDetectIntentInvoke).toHaveBeenCalledTimes(1);
    expect(mockThinkInvoke).toHaveBeenCalledTimes(1);
    expect(mockAutofixInvoke).not.toHaveBeenCalled();
  });

  it("when intent has no payload, runs Think and skips autofix", async () => {
    mockDetectIntentInvoke.mockResolvedValue([]);

    const results = await useCase.invoke(baseExecution());

    expect(results.some((r) => r.id === "ThinkUseCase")).toBe(true);
    expect(mockThinkInvoke).toHaveBeenCalledTimes(1);
    expect(mockAutofixInvoke).not.toHaveBeenCalled();
    expect(mockRunBugbotAutofixCommitAndPush).not.toHaveBeenCalled();
  });

  it("when intent is not fix request, runs Think and skips autofix", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: false,
          isDoRequest: false,
          targetFindingIds: ["f1"],
        },
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockThinkInvoke).toHaveBeenCalledTimes(1);
    expect(mockAutofixInvoke).not.toHaveBeenCalled();
  });

  it("when intent is fix request but no targets, runs Think and skips autofix", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: [],
        },
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockThinkInvoke).toHaveBeenCalledTimes(1);
    expect(mockAutofixInvoke).not.toHaveBeenCalled();
  });

  it("when intent is fix request with targets and context, runs autofix and does not run Think", async () => {
    const context = mockContext();
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: ["finding-1"],
          context,
          branchOverride: "feature/296-bugbot-autofix",
        },
      }),
    ]);
    mockAutofixInvoke.mockResolvedValue([
      new Result({
        id: "BugbotAutofixUseCase",
        success: true,
        executed: true,
        steps: [],
      }),
    ]);

    const results = await useCase.invoke(baseExecution());

    expect(mockAutofixInvoke).toHaveBeenCalledTimes(1);
    expect(mockAutofixInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        targetFindingIds: ["finding-1"],
        userComment: "@bot fix it",
        context,
        branchOverride: "feature/296-bugbot-autofix",
      }),
    );
    expect(mockRunBugbotAutofixCommitAndPush).toHaveBeenCalledTimes(1);
    expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
    expect(mockThinkInvoke).not.toHaveBeenCalled();
    expect(results.some((r) => r.id === "BugbotAutofixUseCase")).toBe(true);
  });

  it("when autofix succeeds but commit returns committed false, does not call markFindingsResolved", async () => {
    const context = mockContext();
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: ["f1"],
          context,
        },
      }),
    ]);
    mockAutofixInvoke.mockResolvedValue([
      new Result({
        id: "BugbotAutofixUseCase",
        success: true,
        executed: true,
        steps: [],
      }),
    ]);
    mockRunBugbotAutofixCommitAndPush.mockResolvedValue({ success: true, committed: false });

    await useCase.invoke(baseExecution());

    expect(mockRunBugbotAutofixCommitAndPush).toHaveBeenCalledTimes(1);
    expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
  });

  it("when autofix returns failure, does not commit or mark resolved, does not run Think", async () => {
    const context = mockContext();
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: ["f1"],
          context,
        },
      }),
    ]);
    mockAutofixInvoke.mockResolvedValue([
      new Result({
        id: "BugbotAutofixUseCase",
        success: false,
        executed: true,
        steps: [],
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockRunBugbotAutofixCommitAndPush).not.toHaveBeenCalled();
    expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
    expect(mockThinkInvoke).not.toHaveBeenCalled();
  });

  it("when autofix returns empty results array, does not commit or mark resolved", async () => {
    const context = mockContext();
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: ["f1"],
          context,
        },
      }),
    ]);
    mockAutofixInvoke.mockResolvedValue([]);

    const results = await useCase.invoke(baseExecution());

    expect(mockAutofixInvoke).toHaveBeenCalledTimes(1);
    expect(mockRunBugbotAutofixCommitAndPush).not.toHaveBeenCalled();
    expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
    expect(mockThinkInvoke).not.toHaveBeenCalled();
    expect(results.filter((r) => r.id === "BugbotAutofixUseCase")).toHaveLength(
      0,
    );
  });

  it("when intent has fix request but no context, runs Think and skips autofix", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: ["f1"],
          context: undefined,
        },
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockAutofixInvoke).not.toHaveBeenCalled();
    expect(mockThinkInvoke).toHaveBeenCalledTimes(1);
  });

  it("aggregates results from language check, intent, and either autofix or Think", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: false,
          isDoRequest: false,
          targetFindingIds: [],
        },
      }),
    ]);

    const results = await useCase.invoke(baseExecution());

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].id).toBe("CheckIssueCommentLanguageUseCase");
    expect(results.some((r) => r.id === "DetectBugbotFixIntentUseCase")).toBe(
      true,
    );
    expect(results.some((r) => r.id === "ThinkUseCase")).toBe(true);
  });

  it("when do user request returns empty results array, does not commit", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: false,
          isDoRequest: true,
          targetFindingIds: [],
        },
      }),
    ]);
    mockDoUserRequestInvoke.mockResolvedValue([]);

    await useCase.invoke(baseExecution());

    expect(mockDoUserRequestInvoke).toHaveBeenCalledTimes(1);
    expect(mockRunUserRequestCommitAndPush).not.toHaveBeenCalled();
    expect(mockThinkInvoke).not.toHaveBeenCalled();
  });

  it("when do user request succeeds, calls runUserRequestCommitAndPush", async () => {
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: false,
          isDoRequest: true,
          targetFindingIds: [],
          branchOverride: "feature/296-from-issue",
        },
      }),
    ]);
    mockDoUserRequestInvoke.mockResolvedValue([
      new Result({
        id: "DoUserRequestUseCase",
        success: true,
        executed: true,
        steps: [],
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockDoUserRequestInvoke).toHaveBeenCalledTimes(1);
    expect(mockRunUserRequestCommitAndPush).toHaveBeenCalledTimes(1);
    expect(mockRunUserRequestCommitAndPush).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ branchOverride: "feature/296-from-issue" }),
      expect.anything(),
      expect.anything(),
    );
    expect(mockThinkInvoke).not.toHaveBeenCalled();
  });

  it("when actor is not allowed to modify files, skips autofix and does not run DoUserRequest", async () => {
    mockIsActorAllowedToModifyFiles.mockResolvedValue(false);
    const context = mockContext();
    mockDetectIntentInvoke.mockResolvedValue([
      new Result({
        id: "DetectBugbotFixIntentUseCase",
        success: true,
        executed: true,
        steps: [],
        payload: {
          isFixRequest: true,
          isDoRequest: false,
          targetFindingIds: ["f1"],
          context,
        },
      }),
    ]);

    await useCase.invoke(baseExecution());

    expect(mockIsActorAllowedToModifyFiles).toHaveBeenCalledTimes(1);
    expect(mockIsActorAllowedToModifyFiles).toHaveBeenCalledWith(
      "o",
      "r",
      undefined,
      "t",
    );
    expect(mockAutofixInvoke).not.toHaveBeenCalled();
    expect(mockDoUserRequestInvoke).not.toHaveBeenCalled();
    expect(mockThinkInvoke).toHaveBeenCalledTimes(1);
  });
});
