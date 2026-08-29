import { PullRequestUseCase } from "../pull_request_use_case";
import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";

const mockLogError = jest.fn();
jest.mock("../../ports/logging_ports", () => ({
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

const workflowSteps = {
  updateTitle: { taskId: 'update-title', invoke: mockUpdateTitleInvoke },
  assignMemberToIssue: { taskId: 'assign-member', invoke: mockAssignMemberInvoke },
  assignReviewersToIssue: { taskId: 'assign-reviewers', invoke: mockAssignReviewersInvoke },
  linkPullRequestProject: { taskId: 'link-project', invoke: mockLinkProjectInvoke },
  linkPullRequestIssue: { taskId: 'link-issue', invoke: mockLinkIssueInvoke },
  syncSizeAndProgressLabels: { taskId: 'sync-labels', invoke: mockSyncLabelsInvoke },
  checkPriorityPullRequestSize: { taskId: 'check-priority', invoke: mockCheckPriorityInvoke },
  closeIssueAfterMerging: { taskId: 'close-issue', invoke: mockCloseIssueInvoke },
};

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
      { taskId: "UpdatePullRequestDescriptionUseCase", invoke: mockUpdateDescriptionInvoke },
      workflowSteps,
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
      { taskId: "UpdatePullRequestDescriptionUseCase", invoke: mockUpdateDescriptionInvoke },
      workflowSteps,
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
      { taskId: "UpdatePullRequestDescriptionUseCase", invoke: mockUpdateDescriptionInvoke },
      workflowSteps,
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
      { taskId: "UpdatePullRequestDescriptionUseCase", invoke: mockUpdateDescriptionInvoke },
      workflowSteps,
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
      { taskId: "UpdatePullRequestDescriptionUseCase", invoke: mockUpdateDescriptionInvoke },
      workflowSteps,
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
