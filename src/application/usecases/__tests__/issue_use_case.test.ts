import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import { IssueUseCase } from "../issue_use_case";

jest.mock("../../../utils/logger", () => ({ logInfo: jest.fn(), logError: jest.fn() }));

const mockCheckPermissionsInvoke = jest.fn();
const mockCloseNotAllowedInvoke = jest.fn();
const mockRemoveIssueBranchesInvoke = jest.fn();
const mockAssignMemberInvoke = jest.fn();
const mockUpdateTitleInvoke = jest.fn();
const mockUpdateIssueTypeInvoke = jest.fn();
const mockLinkIssueProjectInvoke = jest.fn();
const mockCheckPriorityInvoke = jest.fn();
const mockPrepareBranchesInvoke = jest.fn();
const mockRemoveNotNeededInvoke = jest.fn();
const mockDeployAddedInvoke = jest.fn();
const mockDeployedAddedInvoke = jest.fn();
const mockRecommendStepsInvoke = jest.fn();
const mockAnswerIssueHelpInvoke = jest.fn();

const workflowSteps = {
  checkPermissions: { taskId: 'check-permissions', invoke: mockCheckPermissionsInvoke },
  closeNotAllowedIssue: { taskId: 'close-not-allowed', invoke: mockCloseNotAllowedInvoke },
  removeIssueBranches: { taskId: 'remove-branches', invoke: mockRemoveIssueBranchesInvoke },
  assignMemberToIssue: { taskId: 'assign-member', invoke: mockAssignMemberInvoke },
  updateTitle: { taskId: 'update-title', invoke: mockUpdateTitleInvoke },
  updateIssueType: { taskId: 'update-type', invoke: mockUpdateIssueTypeInvoke },
  linkIssueProject: { taskId: 'link-project', invoke: mockLinkIssueProjectInvoke },
  checkPriorityIssueSize: { taskId: 'check-priority', invoke: mockCheckPriorityInvoke },
  prepareBranches: { taskId: 'prepare-branches', invoke: mockPrepareBranchesInvoke },
  removeNotNeededBranches: { taskId: 'remove-not-needed', invoke: mockRemoveNotNeededInvoke },
  deployAdded: { taskId: 'deploy-added', invoke: mockDeployAddedInvoke },
  deployedAdded: { taskId: 'deployed-added', invoke: mockDeployedAddedInvoke },
};

function minimalExecution(overrides: Record<string, unknown> = {}): Execution {
  return {
    cleanIssueBranches: false,
    isBranched: true,
    issue: { opened: false },
    labels: { isRelease: false, isQuestion: false, isHelp: false },
    ...overrides,
  } as unknown as Execution;
}

function createUseCase(): IssueUseCase {
  return new IssueUseCase(
    { taskId: "RecommendStepsUseCase", invoke: mockRecommendStepsInvoke },
    { taskId: "AnswerIssueHelpUseCase", invoke: mockAnswerIssueHelpInvoke },
    workflowSteps,
  );
}

describe("IssueUseCase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckPermissionsInvoke.mockResolvedValue([
      new Result({ id: "perm", success: true, executed: false, steps: [] }),
    ]);
    mockCloseNotAllowedInvoke.mockResolvedValue([]);
    mockRemoveIssueBranchesInvoke.mockResolvedValue([]);
    mockAssignMemberInvoke.mockResolvedValue([]);
    mockUpdateTitleInvoke.mockResolvedValue([]);
    mockUpdateIssueTypeInvoke.mockResolvedValue([]);
    mockLinkIssueProjectInvoke.mockResolvedValue([]);
    mockCheckPriorityInvoke.mockResolvedValue([]);
    mockPrepareBranchesInvoke.mockResolvedValue([]);
    mockRemoveNotNeededInvoke.mockResolvedValue([]);
    mockDeployAddedInvoke.mockResolvedValue([]);
    mockDeployedAddedInvoke.mockResolvedValue([]);
    mockRecommendStepsInvoke.mockResolvedValue([]);
    mockAnswerIssueHelpInvoke.mockResolvedValue([]);
  });

  it("closes and returns early when permissions fail", async () => {
    mockCheckPermissionsInvoke.mockResolvedValue([
      new Result({ id: "perm", success: false, executed: true, steps: [] }),
    ]);
    mockCloseNotAllowedInvoke.mockResolvedValue([
      new Result({ id: "close", success: true, executed: true, steps: [] }),
    ]);
    const param = minimalExecution();

    const results = await createUseCase().invoke(param);

    expect(mockCloseNotAllowedInvoke).toHaveBeenCalledWith(param);
    expect(mockPrepareBranchesInvoke).not.toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });

  it("fails closed when the permission step returns no result", async () => {
    mockCheckPermissionsInvoke.mockResolvedValue([]);
    const param = minimalExecution();

    const results = await createUseCase().invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors[0]).toEqual(
      new Error("Permission check returned no result."),
    );
    expect(mockUpdateTitleInvoke).not.toHaveBeenCalled();
    expect(mockPrepareBranchesInvoke).not.toHaveBeenCalled();
  });

  it("removes issue branches when cleanup is requested", async () => {
    mockRemoveIssueBranchesInvoke.mockResolvedValue([
      new Result({ id: "remove", success: true, executed: true, steps: [] }),
    ]);
    const param = minimalExecution({ cleanIssueBranches: true });

    await createUseCase().invoke(param);

    expect(mockRemoveIssueBranchesInvoke).toHaveBeenCalledWith(param);
  });

  it("prepares branches when branching is enabled", async () => {
    const param = minimalExecution({ isBranched: true });

    await createUseCase().invoke(param);

    expect(mockPrepareBranchesInvoke).toHaveBeenCalledWith(param);
  });

  it("removes issue branches instead when branching is disabled", async () => {
    const param = minimalExecution({ isBranched: false });

    await createUseCase().invoke(param);

    expect(mockRemoveIssueBranchesInvoke).toHaveBeenCalledWith(param);
  });

  it("recommends steps for a newly opened non-release issue", async () => {
    mockRecommendStepsInvoke.mockResolvedValue([
      new Result({ id: "rec", success: true, executed: true, steps: [] }),
    ]);
    const param = minimalExecution({
      issue: { opened: true },
      labels: { isRelease: false, isQuestion: false, isHelp: false },
    });

    const results = await createUseCase().invoke(param);

    expect(mockRecommendStepsInvoke).toHaveBeenCalledWith(param);
    expect(results.some((result) => result.id === "rec")).toBe(true);
  });

  it("recommends steps when the issue description is edited", async () => {
    mockRecommendStepsInvoke.mockResolvedValue([
      new Result({ id: "rec", success: true, executed: true, steps: [] }),
    ]);
    const param = minimalExecution({
      issue: { opened: false, descriptionEdited: true },
      labels: { isRelease: false, isQuestion: false, isHelp: false },
    });

    const results = await createUseCase().invoke(param);

    expect(mockRecommendStepsInvoke).toHaveBeenCalledWith(param);
    expect(results.some((result) => result.id === "rec")).toBe(true);
  });

  it("does not recommend steps for an unrelated issue edit", async () => {
    const param = minimalExecution({
      issue: { opened: false, descriptionEdited: false },
    });

    await createUseCase().invoke(param);

    expect(mockRecommendStepsInvoke).not.toHaveBeenCalled();
  });

  it("posts a static welcome for a newly opened issue when no AI recommendation applies", async () => {
    const param = minimalExecution({
      tokenUser: "vypbot",
      eventName: "issues",
      inputs: { eventName: "issues", action: "opened" },
      issue: { opened: true },
      labels: { isRelease: true, isQuestion: false, isHelp: false },
    });

    const results = await createUseCase().invoke(param);

    expect(mockRecommendStepsInvoke).not.toHaveBeenCalled();
    expect(results.some((result) => result.id === "CopilotWelcomeUseCase")).toBe(true);
    expect(results.find((result) => result.id === "CopilotWelcomeUseCase")?.steps[0]).toContain(
      "<!-- copilot:welcome -->",
    );
  });

  it("posts a static welcome when the initial help agent cannot answer", async () => {
    const param = minimalExecution({
      tokenUser: "vypbot",
      eventName: "issues",
      inputs: { eventName: "issues", action: "opened" },
      issue: { opened: true },
      labels: { isRelease: false, isQuestion: true, isHelp: false },
    });

    const results = await createUseCase().invoke(param);

    expect(mockAnswerIssueHelpInvoke).toHaveBeenCalledWith(param);
    expect(results.some((result) => result.id === "CopilotWelcomeUseCase")).toBe(true);
  });

  it("answers help for a newly opened question or help issue", async () => {
    mockAnswerIssueHelpInvoke.mockResolvedValue([
      new Result({ id: "help", success: true, executed: true, steps: [] }),
    ]);
    const param = minimalExecution({
      issue: { opened: true },
      labels: { isRelease: false, isQuestion: true, isHelp: false },
    });

    const results = await createUseCase().invoke(param);

    expect(mockAnswerIssueHelpInvoke).toHaveBeenCalledWith(param);
    expect(results.some((result) => result.id === "help")).toBe(true);
  });
});
