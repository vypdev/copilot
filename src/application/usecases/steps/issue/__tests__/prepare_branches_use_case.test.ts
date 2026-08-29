import { PrepareBranchesUseCase } from "../prepare_branches_use_case";

jest.mock("../../../../../utils/logger", () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

const mockFetchRemoteBranches = jest.fn();
const mockGetListOfBranches = jest.fn();
const mockFormatBranchName = jest.fn();
const mockGetCommitTag = jest.fn();
const mockCreateLinkedBranch = jest.fn();
const mockWaitForLinkedBranch = jest.fn();
const mockMoveIssueInvoke = jest.fn();
const mockCommitPrefixInvoke = jest.fn();

jest.mock("../move_issue_to_in_progress", () => ({
  MoveIssueToInProgressUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockMoveIssueInvoke,
  })),
}));
jest.mock("../../common/execute_script_use_case", () => ({
  CommitPrefixBuilderUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockCommitPrefixInvoke,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: "o",
    repo: "r",
    issueNumber: 42,
    tokens: { token: "t" },
    issue: { title: "Add login feature" },
    labels: { isMandatoryBranchedLabel: true },
    managementBranch: "feature",
    branches: {
      development: "develop",
      defaultBranch: "main",
      featureTree: "feature",
      bugfixTree: "bugfix",
      docsTree: "docs",
      choreTree: "chore",
      hotfixTree: "hotfix",
      main: "main",
    },
    release: { active: false },
    hotfix: { active: false },
    commitPrefixBuilder: "",
    currentConfiguration: {},
    project: {
      getProjects: () => [],
      getProjectColumnIssueInProgress: () => "",
    },
    ...overrides,
  } as unknown as Parameters<PrepareBranchesUseCase["invoke"]>[0];
}

function createUseCase(): PrepareBranchesUseCase {
  return new PrepareBranchesUseCase(
    {
      moveIssueToColumn: jest.fn(),
      setTaskPriority: jest.fn(),
      setTaskSize: jest.fn(),
    },
    { getListOfBranches: mockGetListOfBranches },
    { formatBranchName: mockFormatBranchName },
    { fetchRemoteBranches: mockFetchRemoteBranches },
    { getCommitTag: mockGetCommitTag },
    { createLinkedBranch: mockCreateLinkedBranch },
    { waitForLinkedBranch: mockWaitForLinkedBranch },
  );
}

describe("PrepareBranchesUseCase", () => {
  let useCase: PrepareBranchesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = createUseCase();
    mockFetchRemoteBranches.mockResolvedValue(undefined);
    mockGetListOfBranches.mockResolvedValue(["develop", "main"]);
    mockFormatBranchName.mockReturnValue("add-login-feature");
    mockGetCommitTag.mockResolvedValue("abc123");
    mockCreateLinkedBranch.mockResolvedValue([
      {
        id: "branch_repository",
        success: true,
        executed: true,
        payload: {
          newBranchName: "feature/42-add-login-feature",
          newBranchUrl:
            "https://github.com/o/r/tree/feature/42-add-login-feature",
          baseBranchName: "develop",
          baseBranchUrl: "https://github.com/o/r/tree/develop",
        },
      },
    ]);
    mockWaitForLinkedBranch.mockResolvedValue(undefined);
    mockMoveIssueInvoke.mockResolvedValue([]);
    mockCommitPrefixInvoke.mockResolvedValue([]);
  });

  it("returns failure before touching collaborators when issue title is empty and branching is optional", async () => {
    const results = await useCase.invoke(
      baseParam({
        issue: { title: "" },
        labels: { isMandatoryBranchedLabel: false },
      }),
    );

    expect(results.some((result) => result.success === false)).toBe(true);
    expect(mockFetchRemoteBranches).not.toHaveBeenCalled();
  });

  it("normalizes an absent mandatory issue title before applying the naming policy", async () => {
    await useCase.invoke(baseParam({ issue: { title: undefined } }));

    expect(mockFormatBranchName).toHaveBeenCalledWith("", 42);
  });

  it("syncs the workspace and reads branch inventory exactly once", async () => {
    await useCase.invoke(baseParam());

    expect(mockFetchRemoteBranches).toHaveBeenCalledTimes(1);
    expect(mockGetListOfBranches).toHaveBeenCalledTimes(1);
    expect(mockGetListOfBranches).toHaveBeenCalledWith("o", "r", "t");
  });

  it("prepares a managed branch through semantic naming, decision, command and delay capabilities", async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);

    expect(mockFormatBranchName).toHaveBeenCalledWith("Add login feature", 42);
    expect(mockCreateLinkedBranch).toHaveBeenCalledWith(
      "o",
      "r",
      "develop",
      "feature/42-add-login-feature",
      42,
      undefined,
      "t",
    );
    expect(param.currentConfiguration).toMatchObject({
      parentBranch: "develop",
      workingBranch: "feature/42-add-login-feature",
    });
    expect(mockWaitForLinkedBranch).toHaveBeenCalledTimes(1);
    expect(results.some((result) => result.success === true)).toBe(true);
  });

  it("renames from a previous issue branch found in the supplied complete inventory and preserves parent", async () => {
    mockGetListOfBranches.mockResolvedValue(["develop", "docs/42-old-title"]);
    mockCreateLinkedBranch.mockResolvedValue([
      {
        success: true,
        executed: true,
        payload: {
          newBranchName: "feature/42-add-login-feature",
          newBranchUrl:
            "https://github.com/o/r/tree/feature/42-add-login-feature",
          baseBranchName: "docs/42-old-title",
          baseBranchUrl: "https://github.com/o/r/tree/docs/42-old-title",
        },
      },
    ]);
    const param = baseParam({
      currentConfiguration: { parentBranch: "release/1.0.0" },
    });

    const results = await useCase.invoke(param);

    expect(mockCreateLinkedBranch).toHaveBeenCalledWith(
      "o",
      "r",
      "docs/42-old-title",
      "feature/42-add-login-feature",
      42,
      undefined,
      "t",
    );
    expect(param.currentConfiguration.parentBranch).toBe("release/1.0.0");
    expect(
      results.some((result) =>
        result.steps.some((step) => step.includes("was renamed")),
      ),
    ).toBe(true);
  });

  it("does not execute a command or delay when the managed target already exists", async () => {
    mockGetListOfBranches.mockResolvedValue(["feature/42-add-login-feature"]);

    const results = await useCase.invoke(baseParam());

    expect(mockCreateLinkedBranch).not.toHaveBeenCalled();
    expect(mockWaitForLinkedBranch).not.toHaveBeenCalled();
    expect(results.at(-1)).toEqual(
      expect.objectContaining({
        success: true,
        executed: false,
        steps: [],
      }),
    );
  });

  it("returns the managed command failure without waiting or moving the issue", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      { success: false, executed: true, steps: ["failed"] },
    ]);

    const results = await useCase.invoke(baseParam());

    expect(results.at(-1)).toMatchObject({ success: false, steps: ["failed"] });
    expect(mockWaitForLinkedBranch).not.toHaveBeenCalled();
    expect(mockMoveIssueInvoke).not.toHaveBeenCalled();
  });

  it("does not continue when managed branch creation returns no branch name", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      { success: true, executed: true, payload: {} },
    ]);

    await useCase.invoke(baseParam());

    expect(mockWaitForLinkedBranch).not.toHaveBeenCalled();
    expect(mockMoveIssueInvoke).not.toHaveBeenCalled();
  });

  it("includes a generated commit prefix for a managed branch", async () => {
    mockCommitPrefixInvoke.mockResolvedValue([
      { payload: { scriptResult: "feat(scope):" } },
    ]);

    const results = await useCase.invoke(
      baseParam({ commitPrefixBuilder: "prefix-script" }),
    );

    expect(
      results.some((result) =>
        result.reminders.some((reminder) => reminder.includes("feat(scope):")),
      ),
    ).toBe(true);
  });

  it("continues managed preparation when the commit-prefix script returns no result", async () => {
    const results = await useCase.invoke(
      baseParam({ commitPrefixBuilder: "prefix-script" }),
    );

    expect(results.some((result) => result.success)).toBe(true);
    expect(
      results.some((result) =>
        result.reminders.some((reminder) =>
          reminder.includes("Commit the needed"),
        ),
      ),
    ).toBe(false);
  });

  it("creates a hotfix linked branch from the resolved tag OID", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      { success: true, executed: true, payload: {} },
    ]);
    const param = baseParam({
      hotfix: {
        active: true,
        baseVersion: "1.0.0",
        version: "1.0.1",
        branch: "hotfix/1.0.1",
        baseBranch: "tags/v1.0.0",
      },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(mockGetCommitTag).toHaveBeenCalledWith("1.0.0");
    expect(mockCreateLinkedBranch).toHaveBeenCalledWith(
      "o",
      "r",
      "tags/v1.0.0",
      "hotfix/1.0.1",
      42,
      "abc123",
      "t",
    );
    expect(
      results.some((result) =>
        result.steps.some((step) => step.includes("tag")),
      ),
    ).toBe(true);
  });

  it("does not create a hotfix branch that already exists", async () => {
    mockGetListOfBranches.mockResolvedValue(["develop", "hotfix/1.0.1"]);
    const param = baseParam({
      hotfix: {
        active: true,
        baseVersion: "1.0.0",
        version: "1.0.1",
        branch: "hotfix/1.0.1",
        baseBranch: "tags/v1.0.0",
      },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(mockCreateLinkedBranch).not.toHaveBeenCalled();
    expect(
      results.some((result) =>
        result.steps.some((step) => step.includes("already exists")),
      ),
    ).toBe(true);
  });

  it("returns a linked command failure from hotfix preparation", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      { success: false, executed: true, steps: ["hotfix failed"] },
    ]);
    const param = baseParam({
      hotfix: {
        active: true,
        baseVersion: "1.0.0",
        version: "1.0.1",
        branch: "hotfix/1.0.1",
        baseBranch: "tags/v1.0.0",
      },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(results.at(-1)).toMatchObject({
      success: false,
      steps: ["hotfix failed"],
    });
  });

  it("fails hotfix preparation when version metadata is absent", async () => {
    const results = await useCase.invoke(
      baseParam({
        hotfix: { active: true },
        currentConfiguration: {},
      }),
    );

    expect(
      results.some(
        (result) =>
          !result.success &&
          result.steps.some((step) => step.includes("no tag")),
      ),
    ).toBe(true);
  });

  it("creates a release linked branch through only the linked branch command", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      {
        success: true,
        executed: true,
        payload: {
          newBranchName: "release/2.0.0",
          newBranchUrl: "https://github.com/o/r/tree/release/2.0.0",
        },
      },
    ]);
    const param = baseParam({
      release: { active: true, version: "2.0.0", branch: "release/2.0.0" },
      labels: { deploy: "deploy" },
      workflows: { release: "release-wf" },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(mockCreateLinkedBranch).toHaveBeenCalledWith(
      "o",
      "r",
      "develop",
      "release/2.0.0",
      42,
      undefined,
      "t",
    );
    expect(results.some((result) => result.success)).toBe(true);
  });

  it("does not create a release branch that already exists", async () => {
    mockGetListOfBranches.mockResolvedValue(["develop", "release/2.0.0"]);
    const param = baseParam({
      release: { active: true, version: "2.0.0", branch: "release/2.0.0" },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(mockCreateLinkedBranch).not.toHaveBeenCalled();
    expect(results.some((result) => result.reminders.length > 0)).toBe(true);
  });

  it("fails closed when release creation returns no branch name", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      { success: true, executed: true, payload: {} },
    ]);
    const param = baseParam({
      release: { active: true, version: "2.0.0", branch: "release/2.0.0" },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(results.at(-1)).toMatchObject({
      success: false,
      steps: [expect.stringContaining("no branch name")],
    });
  });

  it("returns a linked command failure from release preparation", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      { success: false, executed: true, steps: ["release failed"] },
    ]);
    const param = baseParam({
      release: { active: true, version: "2.0.0", branch: "release/2.0.0" },
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(results.at(-1)).toMatchObject({
      success: false,
      steps: ["release failed"],
    });
  });

  it("includes a generated commit prefix for a release branch", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      {
        success: true,
        executed: true,
        payload: { newBranchName: "release/2.0.0" },
      },
    ]);
    mockCommitPrefixInvoke.mockResolvedValue([
      { payload: { scriptResult: "chore(release):" } },
    ]);
    const param = baseParam({
      release: { active: true, version: "2.0.0", branch: "release/2.0.0" },
      labels: { deploy: "deploy" },
      workflows: { release: "release-wf" },
      commitPrefixBuilder: "prefix-script",
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(
      results.some((result) =>
        result.reminders.some((reminder) =>
          reminder.includes("chore(release):"),
        ),
      ),
    ).toBe(true);
  });

  it("continues release preparation when the commit-prefix script returns no result", async () => {
    mockCreateLinkedBranch.mockResolvedValue([
      {
        success: true,
        executed: true,
        payload: { newBranchName: "release/2.0.0" },
      },
    ]);
    const param = baseParam({
      release: { active: true, version: "2.0.0", branch: "release/2.0.0" },
      labels: { deploy: "deploy" },
      workflows: { release: "release-wf" },
      commitPrefixBuilder: "prefix-script",
      currentConfiguration: {},
    });

    const results = await useCase.invoke(param);

    expect(results.some((result) => result.success)).toBe(true);
    expect(
      results.some((result) =>
        result.reminders.some((reminder) =>
          reminder.includes("Commit the needed"),
        ),
      ),
    ).toBe(false);
  });

  it("fails release preparation when version metadata is absent", async () => {
    const results = await useCase.invoke(
      baseParam({ release: { active: true }, currentConfiguration: {} }),
    );

    expect(
      results.some(
        (result) =>
          !result.success &&
          result.steps.some((step) => step.includes("release version")),
      ),
    ).toBe(true);
  });

  it("moves the issue only after successful managed branch propagation", async () => {
    const param = baseParam();

    await useCase.invoke(param);

    expect(mockWaitForLinkedBranch).toHaveBeenCalledTimes(1);
    expect(mockMoveIssueInvoke).toHaveBeenCalledWith(param);
    expect(mockWaitForLinkedBranch.mock.invocationCallOrder[0]).toBeLessThan(
      mockMoveIssueInvoke.mock.invocationCallOrder[0],
    );
  });

  it("maps non-Error collaborator failures without losing the cause", async () => {
    mockGetListOfBranches.mockRejectedValue("inventory failed");

    const results = await useCase.invoke(baseParam());

    expect(results.at(-1)).toMatchObject({
      success: false,
      executed: true,
      errors: [expect.objectContaining({ message: "inventory failed" })],
    });
  });

  it("preserves Error collaborator failures", async () => {
    mockFetchRemoteBranches.mockRejectedValue(new Error("sync failed"));

    const results = await useCase.invoke(baseParam());

    expect(results.at(-1)?.errors[0]).toEqual(new Error("sync failed"));
  });
});
