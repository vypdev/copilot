import { PullRequestUseCase } from "../pull_request_use_case";
import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";

const mockLogError = jest.fn();
jest.mock("../../../utils/logger", () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: (...args: unknown[]) => mockLogError(...args),
}));

const mockUpdateTitleInvoke = jest.fn();
const mockAssignMemberInvoke = jest.fn();
const mockAssignReviewersInvoke = jest.fn();
const mockLinkProjectInvoke = jest.fn();
const mockLinkIssueInvoke = jest.fn();
const mockSyncLabelsInvoke = jest.fn();
const mockCheckPriorityInvoke = jest.fn();
const mockUpdateDescriptionInvoke = jest.fn();
const mockCloseIssueInvoke = jest.fn();

jest.mock("../steps/common/update_title_use_case", () => ({
  UpdateTitleUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockUpdateTitleInvoke })),
}));
jest.mock("../steps/issue/assign_members_to_issue_use_case", () => ({
  AssignMemberToIssueUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockAssignMemberInvoke })),
}));
jest.mock("../steps/issue/assign_reviewers_to_issue_use_case", () => ({
  AssignReviewersToIssueUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockAssignReviewersInvoke })),
}));
jest.mock("../steps/pull_request/link_pull_request_project_use_case", () => ({
  LinkPullRequestProjectUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockLinkProjectInvoke })),
}));
jest.mock("../steps/pull_request/link_pull_request_issue_use_case", () => ({
  LinkPullRequestIssueUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockLinkIssueInvoke })),
}));
jest.mock(
  "../steps/pull_request/sync_size_and_progress_labels_from_issue_to_pr_use_case",
  () => ({
    SyncSizeAndProgressLabelsFromIssueToPrUseCase: jest
      .fn()
      .mockImplementation(() => ({ invoke: mockSyncLabelsInvoke })),
  }),
);
jest.mock(
  "../steps/pull_request/check_priority_pull_request_size_use_case",
  () => ({
    CheckPriorityPullRequestSizeUseCase: jest
      .fn()
      .mockImplementation(() => ({ invoke: mockCheckPriorityInvoke })),
  }),
);
jest.mock(
  "../steps/pull_request/update_pull_request_description_use_case",
  () => ({
    UpdatePullRequestDescriptionUseCase: jest
      .fn()
      .mockImplementation(() => ({ invoke: mockUpdateDescriptionInvoke })),
  }),
);
jest.mock("../steps/issue/close_issue_after_merging_use_case", () => ({
  CloseIssueAfterMergingUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockCloseIssueInvoke })),
}));

function minimalExecution(overrides: Record<string, unknown> = {}): Execution {
  return {
    pullRequest: {
      action: "opened",
      isOpened: true,
      isMerged: false,
      isClosed: false,
      isSynchronize: false,
    },
    ai: { getAiPullRequestDescription: () => false },
    ...overrides,
  } as unknown as Execution;
}

describe("PullRequestUseCase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTitleInvoke.mockResolvedValue([]);
    mockAssignMemberInvoke.mockResolvedValue([]);
    mockAssignReviewersInvoke.mockResolvedValue([]);
    mockLinkProjectInvoke.mockResolvedValue([]);
    mockLinkIssueInvoke.mockResolvedValue([]);
    mockSyncLabelsInvoke.mockResolvedValue([]);
    mockCheckPriorityInvoke.mockResolvedValue([]);
    mockUpdateDescriptionInvoke.mockResolvedValue([]);
    mockCloseIssueInvoke.mockResolvedValue([]);
  });

  it("when PR is opened, runs update title, assign, link, sync, check priority", async () => {
    const useCase = new PullRequestUseCase(
      { setTaskPriority: jest.fn().mockResolvedValue(true) },
      { updateDescription: jest.fn() },
      { getDescription: jest.fn().mockResolvedValue("") },
      {
        getTitle: jest.fn(),
        updateTitleIssueFormat: jest.fn(),
        updateTitlePullRequestFormat: jest.fn(),
      },
      { closeIssue: jest.fn(), addComment: jest.fn() },
      { getCurrentAssignees: jest.fn(), assignMembersToIssue: jest.fn() },
      { getCurrentReviewers: jest.fn(), addReviewersToPullRequest: jest.fn() },
      {
        getAllMembers: jest.fn().mockResolvedValue([]),
        getRandomMembers: jest.fn(),
      },
      { getLabels: jest.fn(), setLabels: jest.fn() },
      {
        isLinked: jest.fn().mockResolvedValue(true),
        updateBaseBranch: jest.fn(),
        updateDescription: jest.fn(),
      },
      { linkContentId: jest.fn() },
      {
        moveIssueToColumn: jest.fn(),
        setTaskPriority: jest.fn(),
        setTaskSize: jest.fn(),
      },
      {
        taskId: "UpdatePullRequestDescriptionUseCase",
        invoke: mockUpdateDescriptionInvoke,
      },
    );
    const param = minimalExecution({
      pullRequest: {
        isOpened: true,
        isSynchronize: false,
        isClosed: false,
        isMerged: false,
        action: "opened",
      },
    });
    await useCase.invoke(param);

    expect(mockUpdateTitleInvoke).toHaveBeenCalledWith(param);
    expect(mockAssignMemberInvoke).toHaveBeenCalledWith(param);
    expect(mockAssignReviewersInvoke).toHaveBeenCalledWith(param);
    expect(mockLinkProjectInvoke).toHaveBeenCalledWith(param);
    expect(mockLinkIssueInvoke).toHaveBeenCalledWith(param);
    expect(mockSyncLabelsInvoke).toHaveBeenCalledWith(param);
    expect(mockCheckPriorityInvoke).toHaveBeenCalledWith(param);
  });

  it("when PR is opened and ai getAiPullRequestDescription, calls UpdatePullRequestDescriptionUseCase", async () => {
    mockUpdateDescriptionInvoke.mockResolvedValue([
      new Result({ id: "desc", success: true, executed: true, steps: [] }),
    ]);

    const useCase = new PullRequestUseCase(
      { setTaskPriority: jest.fn().mockResolvedValue(true) },
      { updateDescription: jest.fn() },
      { getDescription: jest.fn().mockResolvedValue("") },
      {
        getTitle: jest.fn(),
        updateTitleIssueFormat: jest.fn(),
        updateTitlePullRequestFormat: jest.fn(),
      },
      { closeIssue: jest.fn(), addComment: jest.fn() },
      { getCurrentAssignees: jest.fn(), assignMembersToIssue: jest.fn() },
      { getCurrentReviewers: jest.fn(), addReviewersToPullRequest: jest.fn() },
      {
        getAllMembers: jest.fn().mockResolvedValue([]),
        getRandomMembers: jest.fn(),
      },
      { getLabels: jest.fn(), setLabels: jest.fn() },
      {
        isLinked: jest.fn().mockResolvedValue(true),
        updateBaseBranch: jest.fn(),
        updateDescription: jest.fn(),
      },
      { linkContentId: jest.fn() },
      {
        moveIssueToColumn: jest.fn(),
        setTaskPriority: jest.fn(),
        setTaskSize: jest.fn(),
      },
      {
        taskId: "UpdatePullRequestDescriptionUseCase",
        invoke: mockUpdateDescriptionInvoke,
      },
    );
    const param = minimalExecution({
      pullRequest: {
        isOpened: true,
        isSynchronize: false,
        isClosed: false,
        isMerged: false,
        action: "opened",
      },
      ai: { getAiPullRequestDescription: () => true },
    });
    const results = await useCase.invoke(param);

    expect(mockUpdateDescriptionInvoke).toHaveBeenCalledWith(param);
    expect(results.some((r) => r.id === "desc")).toBe(true);
  });

  it("when PR is synchronize and ai description enabled, updates description", async () => {
    const useCase = new PullRequestUseCase(
      { setTaskPriority: jest.fn().mockResolvedValue(true) },
      { updateDescription: jest.fn() },
      { getDescription: jest.fn().mockResolvedValue("") },
      {
        getTitle: jest.fn(),
        updateTitleIssueFormat: jest.fn(),
        updateTitlePullRequestFormat: jest.fn(),
      },
      { closeIssue: jest.fn(), addComment: jest.fn() },
      { getCurrentAssignees: jest.fn(), assignMembersToIssue: jest.fn() },
      { getCurrentReviewers: jest.fn(), addReviewersToPullRequest: jest.fn() },
      {
        getAllMembers: jest.fn().mockResolvedValue([]),
        getRandomMembers: jest.fn(),
      },
      { getLabels: jest.fn(), setLabels: jest.fn() },
      {
        isLinked: jest.fn().mockResolvedValue(true),
        updateBaseBranch: jest.fn(),
        updateDescription: jest.fn(),
      },
      { linkContentId: jest.fn() },
      {
        moveIssueToColumn: jest.fn(),
        setTaskPriority: jest.fn(),
        setTaskSize: jest.fn(),
      },
      {
        taskId: "UpdatePullRequestDescriptionUseCase",
        invoke: mockUpdateDescriptionInvoke,
      },
    );
    const param = minimalExecution({
      pullRequest: {
        isOpened: false,
        isSynchronize: true,
        isClosed: false,
        isMerged: false,
        action: "synchronize",
      },
      ai: { getAiPullRequestDescription: () => true },
    });
    await useCase.invoke(param);

    expect(mockUpdateDescriptionInvoke).toHaveBeenCalledWith(param);
  });

  it("when PR is closed and merged, calls CloseIssueAfterMergingUseCase", async () => {
    mockCloseIssueInvoke.mockResolvedValue([
      new Result({ id: "close", success: true, executed: true, steps: [] }),
    ]);

    const useCase = new PullRequestUseCase(
      { setTaskPriority: jest.fn().mockResolvedValue(true) },
      { updateDescription: jest.fn() },
      { getDescription: jest.fn().mockResolvedValue("") },
      {
        getTitle: jest.fn(),
        updateTitleIssueFormat: jest.fn(),
        updateTitlePullRequestFormat: jest.fn(),
      },
      { closeIssue: jest.fn(), addComment: jest.fn() },
      { getCurrentAssignees: jest.fn(), assignMembersToIssue: jest.fn() },
      { getCurrentReviewers: jest.fn(), addReviewersToPullRequest: jest.fn() },
      {
        getAllMembers: jest.fn().mockResolvedValue([]),
        getRandomMembers: jest.fn(),
      },
      { getLabels: jest.fn(), setLabels: jest.fn() },
      {
        isLinked: jest.fn().mockResolvedValue(true),
        updateBaseBranch: jest.fn(),
        updateDescription: jest.fn(),
      },
      { linkContentId: jest.fn() },
      {
        moveIssueToColumn: jest.fn(),
        setTaskPriority: jest.fn(),
        setTaskSize: jest.fn(),
      },
      {
        taskId: "UpdatePullRequestDescriptionUseCase",
        invoke: mockUpdateDescriptionInvoke,
      },
    );
    const param = minimalExecution({
      pullRequest: {
        isOpened: false,
        isSynchronize: false,
        isClosed: true,
        isMerged: true,
        action: "closed",
      },
    });
    const results = await useCase.invoke(param);

    expect(mockCloseIssueInvoke).toHaveBeenCalledWith(param);
    expect(results.some((r) => r.id === "close")).toBe(true);
  });

  it("on error pushes a sanitized semantic failure result", async () => {
    mockLogError.mockClear();
    mockUpdateTitleInvoke.mockRejectedValue(new Error("secret-token"));

    const useCase = new PullRequestUseCase(
      { setTaskPriority: jest.fn().mockResolvedValue(true) },
      { updateDescription: jest.fn() },
      { getDescription: jest.fn().mockResolvedValue("") },
      {
        getTitle: jest.fn(),
        updateTitleIssueFormat: jest.fn(),
        updateTitlePullRequestFormat: jest.fn(),
      },
      { closeIssue: jest.fn(), addComment: jest.fn() },
      { getCurrentAssignees: jest.fn(), assignMembersToIssue: jest.fn() },
      { getCurrentReviewers: jest.fn(), addReviewersToPullRequest: jest.fn() },
      {
        getAllMembers: jest.fn().mockResolvedValue([]),
        getRandomMembers: jest.fn(),
      },
      { getLabels: jest.fn(), setLabels: jest.fn() },
      {
        isLinked: jest.fn().mockResolvedValue(true),
        updateBaseBranch: jest.fn(),
        updateDescription: jest.fn(),
      },
      { linkContentId: jest.fn() },
      {
        moveIssueToColumn: jest.fn(),
        setTaskPriority: jest.fn(),
        setTaskSize: jest.fn(),
      },
      {
        taskId: "UpdatePullRequestDescriptionUseCase",
        invoke: mockUpdateDescriptionInvoke,
      },
    );
    const param = minimalExecution();
    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain("Unable to process the pull request.");
    expect(results[0].errors).toHaveLength(1);
    expect(results[0].errors[0]).toEqual(
      new Error("Unable to process the pull request."),
    );
    expect(JSON.stringify(results)).not.toContain("secret-token");
    expect(mockLogError).toHaveBeenCalledWith(
      new Error("Unable to process the pull request."),
    );
    expect(JSON.stringify(mockLogError.mock.calls)).not.toContain(
      "secret-token",
    );
  });
});
