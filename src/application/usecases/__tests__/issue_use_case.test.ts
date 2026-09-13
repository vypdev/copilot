import type { Execution } from "../../../data/model/execution";
import { Ai } from "../../../data/model/ai";
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
};

function minimalExecution(overrides: Record<string, unknown> = {}): Execution {
  const defaultIssue = { number: 8, opened: false, creator: 'alice', title: 'Issue', body: '', labeled: false, labelAdded: '', desiredAssigneesCount: 1, branchManagementAlways: false };
  const defaultPullRequest = { number: -1, opened: false, creator: '', title: '', id: '', desiredAssigneesCount: 0 };
  const defaultLabels = {
    isRelease: false,
    isQuestion: false,
    isHelp: false,
    isMandatoryBranchedLabel: false,
    currentIssueLabels: [],
    isHotfix: false,
    isBugfix: false,
    isBug: false,
    isFeature: false,
    isEnhancement: false,
    isDocs: false,
    isDocumentation: false,
    isChore: false,
    isMaintenance: false,
    containsBranchedLabel: false,
    priorityLabelOnIssue: undefined,
    priorityLabelOnIssueProcessable: false,
    priorityHigh: 'priority: high',
    priorityMedium: 'priority: medium',
    priorityLow: 'priority: low',
    feature: 'feature',
    bugfix: 'bugfix',
    deploy: 'deploy',
  };
  const base = {
    cleanIssueBranches: false,
    isBranched: true,
    isIssue: true,
    isPullRequest: false,
    issueNumber: 8,
    owner: 'org',
    repo: 'repo',
    issue: defaultIssue,
    pullRequest: defaultPullRequest,
    labels: defaultLabels,
    emoji: { emojiLabeledTitle: false, branchManagementEmoji: '' },
    release: { active: false },
    hotfix: { active: false },
    project: {
      getProjects: () => [],
      getProjectColumnIssueCreated: () => 'Todo',
      getProjectColumnPullRequestCreated: () => 'Review',
      getProjectColumnIssueInProgress: () => 'In Progress',
    },
    branches: {
      main: 'main', defaultBranch: 'main', development: 'develop',
      featureTree: 'feature', bugfixTree: 'bugfix', docsTree: 'docs', choreTree: 'chore', hotfixTree: 'hotfix',
    },
    issueTypes: Object.fromEntries([
      'task', 'bug', 'feature', 'documentation', 'maintenance', 'hotfix', 'release', 'question', 'help',
    ].flatMap((name) => [[name, name], [`${name}Description`, `${name} description`], [`${name}Color`, 'BLUE']])),
    managementBranch: 'feature',
    previousConfiguration: undefined,
    currentConfiguration: {},
    commitPrefixBuilder: '',
    workflows: { release: 'release.yml', hotfix: 'hotfix.yml' },
    eventName: '',
    ai: new Ai("", "model", false, [], false, "low", 20),
    ...overrides,
  } as Record<string, unknown>;
  if (overrides.issue) base.issue = { ...defaultIssue, ...(overrides.issue as object) };
  if (overrides.pullRequest) base.pullRequest = { ...defaultPullRequest, ...(overrides.pullRequest as object) };
  if (overrides.labels) base.labels = { ...defaultLabels, ...(overrides.labels as object) };
  return base as unknown as Execution;
}

function createUseCase(actorAuthorizationPort?: ConstructorParameters<typeof IssueUseCase>[3]): IssueUseCase {
  return new IssueUseCase(
    { taskId: "RecommendStepsUseCase", invoke: mockRecommendStepsInvoke },
    { taskId: "AnswerIssueHelpUseCase", invoke: mockAnswerIssueHelpInvoke },
    workflowSteps,
    actorAuthorizationPort,
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
    mockPrepareBranchesInvoke.mockResolvedValue({ results: [], configurationPatch: {} });
    mockRemoveNotNeededInvoke.mockResolvedValue([]);
    mockDeployAddedInvoke.mockResolvedValue([]);
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

    expect(mockCloseNotAllowedInvoke).toHaveBeenCalledWith({ issueNumber: 8 });
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

    expect(mockRemoveIssueBranchesInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 8 }));
  });

  it("prepares branches when branching is enabled", async () => {
    const param = minimalExecution({ isBranched: true });

    await createUseCase().invoke(param);

    expect(mockPrepareBranchesInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 8, issueTitle: 'Issue' }));
  });

  it('applies only the explicit successful branch configuration patch at the route boundary', async () => {
    mockPrepareBranchesInvoke.mockResolvedValue({
      results: [new Result({ id: 'branch', success: true, executed: true })],
      configurationPatch: {
        parentBranch: 'develop',
        workingBranch: 'feature/8-issue',
        releaseBranch: 'release/2.0.0',
        releaseOriginBranch: 'develop',
        releaseOriginSha: 'abc',
        hotfixBranch: 'hotfix/2.0.1',
        hotfixOriginSha: 'def',
      },
    });
    const param = minimalExecution({ isBranched: true, currentConfiguration: { branchType: 'feature' } });

    const results = await createUseCase().invoke(param);

    expect(param.currentConfiguration).toMatchObject({
      branchType: 'feature',
      parentBranch: 'develop',
      workingBranch: 'feature/8-issue',
      releaseBranch: 'release/2.0.0',
      releaseOriginBranch: 'develop',
      releaseOriginSha: 'abc',
      hotfixBranch: 'hotfix/2.0.1',
      hotfixOriginSha: 'def',
    });
    expect(results.some((result) => result.id === 'branch')).toBe(true);
  });

  it("removes issue branches instead when branching is disabled", async () => {
    const param = minimalExecution({ isBranched: false });

    await createUseCase().invoke(param);

    expect(mockRemoveIssueBranchesInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 8 }));
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

  it('authorizes the projected actor before member-only issue recommendations', async () => {
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) };
    const param = minimalExecution({
      actor: 'alice',
      issue: { opened: true },
      ai: new Ai('', 'model', true, [], false, 'low', 20),
    });

    await createUseCase(authorization).invoke(param);

    expect(authorization.isActorAllowedToModifyFiles).toHaveBeenCalledWith('alice');
    expect(mockRecommendStepsInvoke).toHaveBeenCalledWith(param);
  });

  it('suppresses member-only issue recommendations when authorization is denied', async () => {
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) };
    const param = minimalExecution({
      actor: 'outsider',
      issue: { opened: true },
      ai: new Ai('', 'model', true, [], false, 'low', 20),
    });

    await createUseCase(authorization).invoke(param);

    expect(authorization.isActorAllowedToModifyFiles).toHaveBeenCalledWith('outsider');
    expect(mockRecommendStepsInvoke).not.toHaveBeenCalled();
    expect(mockAnswerIssueHelpInvoke).not.toHaveBeenCalled();
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

    expect(mockAnswerIssueHelpInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 8, questionOrHelp: true }));
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

    expect(mockAnswerIssueHelpInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 8, questionOrHelp: true }));
    expect(results.some((result) => result.id === "help")).toBe(true);
  });
});
