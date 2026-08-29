import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import { IssueUseCase } from "../issue_use_case";

jest.mock("../../../utils/logger", () => ({ logInfo: jest.fn() }));

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

jest.mock("../steps/common/check_permissions_use_case", () => ({
  CheckPermissionsUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockCheckPermissionsInvoke })),
}));
jest.mock("../steps/issue/close_not_allowed_issue_use_case", () => ({
  CloseNotAllowedIssueUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockCloseNotAllowedInvoke })),
}));
jest.mock("../steps/issue/remove_issue_branches_use_case", () => ({
  RemoveIssueBranchesUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockRemoveIssueBranchesInvoke })),
}));
jest.mock("../steps/issue/assign_members_to_issue_use_case", () => ({
  AssignMemberToIssueUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockAssignMemberInvoke })),
}));
jest.mock("../steps/common/update_title_use_case", () => ({
  UpdateTitleUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockUpdateTitleInvoke })),
}));
jest.mock("../steps/issue/update_issue_type_use_case", () => ({
  UpdateIssueTypeUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockUpdateIssueTypeInvoke })),
}));
jest.mock("../steps/issue/link_issue_project_use_case", () => ({
  LinkIssueProjectUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockLinkIssueProjectInvoke })),
}));
jest.mock("../steps/issue/check_priority_issue_size_use_case", () => ({
  CheckPriorityIssueSizeUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockCheckPriorityInvoke })),
}));
jest.mock("../steps/issue/prepare_branches_use_case", () => ({
  PrepareBranchesUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockPrepareBranchesInvoke })),
}));
jest.mock("../steps/issue/remove_not_needed_branches_use_case", () => ({
  RemoveNotNeededBranchesUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockRemoveNotNeededInvoke })),
}));
jest.mock("../steps/issue/label_deploy_added_use_case", () => ({
  DeployAddedUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockDeployAddedInvoke })),
}));
jest.mock("../steps/issue/label_deployed_added_use_case", () => ({
  DeployedAddedUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockDeployedAddedInvoke })),
}));
jest.mock("../actions/recommend_steps_use_case", () => ({
  RecommendStepsUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockRecommendStepsInvoke })),
}));
jest.mock("../steps/issue/answer_issue_help_use_case", () => ({
  AnswerIssueHelpUseCase: jest
    .fn()
    .mockImplementation(() => ({ invoke: mockAnswerIssueHelpInvoke })),
}));

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
    { setTaskPriority: jest.fn().mockResolvedValue(true) },
    {
      getAllMembers: jest.fn().mockResolvedValue([]),
      getRandomMembers: jest.fn(),
    },
    { getId: jest.fn().mockResolvedValue("id") },
    {
      moveIssueToColumn: jest.fn(),
      setTaskPriority: jest.fn(),
      setTaskSize: jest.fn(),
    },
    { linkContentId: jest.fn() },
    {
      getTitle: jest.fn(),
      updateTitleIssueFormat: jest.fn(),
      updateTitlePullRequestFormat: jest.fn(),
    },
    { getCurrentAssignees: jest.fn(), assignMembersToIssue: jest.fn() },
    { closeIssue: jest.fn(), addComment: jest.fn() },
    { setIssueType: jest.fn() },
    { getDescription: jest.fn() },
    { addComment: jest.fn(), openIssue: jest.fn() },
    { getListOfBranches: jest.fn(), removeBranch: jest.fn() },
    { formatBranchName: jest.fn() },
    { fetchRemoteBranches: jest.fn() },
    { getCommitTag: jest.fn() },
    { createLinkedBranch: jest.fn() },
    { waitForLinkedBranch: jest.fn() },
    { executeWorkflow: jest.fn() },
    { taskId: "RecommendStepsUseCase", invoke: mockRecommendStepsInvoke },
    { taskId: "AnswerIssueHelpUseCase", invoke: mockAnswerIssueHelpInvoke },
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
