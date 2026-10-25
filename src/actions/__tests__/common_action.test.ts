/**
 * Unit tests for mainRun (common_action).
 * Mocks use cases and queue; covers dispatch branches and error handling.
 */

jest.mock('chalk', () => ({
  cyan: (s: string) => s,
  gray: (s: string) => s,
  default: { cyan: (s: string) => s, gray: (s: string) => s },
}));
jest.mock('boxen', () => jest.fn((text: string) => text));

import { mainRun as productionMainRun } from '../common_action';
import { createSetupExecutionUseCase } from '../../infrastructure/composition/execution_setup_composition_root';
import { createWaitForPreviousWorkflowRunsUseCase } from '../../infrastructure/composition/workflow_queue_composition_root';
import { createMainRunRouteCompositionRoot } from '../../infrastructure/composition/main_run_route_composition_root';
import type { ProjectBoardCommandPort } from '../../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
import type { Execution } from '../../data/model/execution';
import type { SynchronizeAgentActivityUseCase } from '../../application/usecases/actions/synchronize_agent_activity_use_case';
import { Result } from '../../data/model/result';
import { logInfo } from '../../utils/logger';
import { readFileSync } from 'node:fs';
import { buildPreviousWorkflowRunsQuery } from '../main_run_lifecycle';
import * as issueWorkflowRuntimePolicy from '../../domain/issue_workflow_runtime_policy';
import { WaitForPreviousWorkflowRunsUseCase } from '../../application/usecases/workflow/wait_for_previous_workflow_runs_use_case';
import { NativeWorkflowCoordinationRepository } from '../../data/repository/workflow/native_workflow_coordination_repository';
import { ActivePreviousWorkflowRunsRepository } from '../../data/repository/workflow/active_previous_workflow_runs_repository';
import type { PreviousWorkflowRunsQuery } from '../../application/ports/workflow_run_ports';

jest.mock('@actions/core', () => ({
  setFailed: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  setGlobalLoggerDebug: jest.fn(),
  clearAccumulatedLogs: jest.fn(),
}));

const mockSingleActionInvoke = jest.fn();
const mockIssueCommentInvoke = jest.fn();
const mockIssueInvoke = jest.fn();
const mockPullRequestReviewCommentInvoke = jest.fn();
const mockPullRequestInvoke = jest.fn();
const mockCommitInvoke = jest.fn();
const mockSetupExecutionInvoke = jest.fn();
const mockWaitForPreviousWorkflowRunsInvoke = jest.fn();
const mockAgentActivityStart = jest.fn();
const mockAgentActivityFinish = jest.fn();
const mockLifecycleStateInvoke = jest.fn();
const mockClosedIssueRetireInvoke = jest.fn();

function unresolvedSetupResult(context: {
  tokenUser?: string;
  issueNumber: number;
  singleAction: { issue: number; isIssue: boolean; isPullRequest: boolean; isPush: boolean };
}) {
  return {
    status: 'issue-unresolved',
    tokenUser: context.tokenUser ?? 'user',
    issueResolution: {
      issueNumber: context.issueNumber,
      singleAction: {
        issue: context.singleAction.issue,
        isIssue: context.singleAction.isIssue,
        isPullRequest: context.singleAction.isPullRequest,
        isPush: context.singleAction.isPush,
      },
    },
  };
}

function configuredSetupResult(
  context: Parameters<typeof unresolvedSetupResult>[0],
  admission: unknown,
  previousConfiguration?: Record<string, unknown>,
) {
  return {
    ...unresolvedSetupResult(context),
    status: 'configured',
    branchType: '',
    state: {
      previousConfiguration,
      currentIssueLabels: [],
      currentPullRequestLabels: [],
      release: { active: false },
      hotfix: { active: false },
      configuration: {},
      issueWorkflowAdmission: admission,
      liveIssueBody: '',
    },
  };
}

jest.mock('../../infrastructure/composition/main_run_route_composition_root', () => ({
  createClosedIssueRetirementUseCase: jest.fn(() => ({ taskId: 'retire', invoke: mockClosedIssueRetireInvoke })),
  createMainRunRouteCompositionRoot: jest.fn().mockImplementation(() => ({
    'single-action': mockSingleActionInvoke,
    'issue-comment': mockIssueCommentInvoke,
    issue: mockIssueInvoke,
    'pull-request-review-comment': mockPullRequestReviewCommentInvoke,
    'pull-request': mockPullRequestInvoke,
    push: mockCommitInvoke,
  })),
}));

jest.mock('../../infrastructure/composition/execution_setup_composition_root', () => ({
  createSetupExecutionUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockSetupExecutionInvoke,
  })),
}));

jest.mock('../../infrastructure/composition/workflow_queue_composition_root', () => ({
  createWaitForPreviousWorkflowRunsUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockWaitForPreviousWorkflowRunsInvoke,
  })),
}));

jest.mock('../../application/usecases/single_action_use_case', () => ({
  SingleActionUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockSingleActionInvoke,
  })),
}));
jest.mock('../../application/usecases/issue_comment_use_case', () => ({
  IssueCommentUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockIssueCommentInvoke,
  })),
}));
jest.mock('../../application/usecases/issue_use_case', () => ({
  IssueUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockIssueInvoke,
  })),
}));
jest.mock('../../application/usecases/pull_request_review_comment_use_case', () => ({
  PullRequestReviewCommentUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockPullRequestReviewCommentInvoke,
  })),
}));
jest.mock('../../application/usecases/pull_request_use_case', () => ({
  PullRequestUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockPullRequestInvoke,
  })),
}));
jest.mock('../../application/usecases/commit_use_case', () => ({
  CommitUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockCommitInvoke,
  })),
}));

const core = require('@actions/core');
const logger = require('../../utils/logger');

function mockExecution(overrides: Record<string, unknown> = {}): Execution {
  const base = {
    debug: false,
    inputs: {},
    eventName: '',
    setup: jest.fn().mockResolvedValue(undefined),
    welcome: undefined,
    runnedByToken: false,
    tokenUser: 'user',
    isSingleAction: false,
    singleAction: {
      issue: 42,
      currentSingleAction: '',
      isIssue: false,
      isPullRequest: false,
      isPush: false,
      validSingleAction: false,
      isSingleActionWithoutIssue: false,
      enabledSingleAction: false,
    },
    issueNumber: 42,
    owner: 'org',
    repo: 'repo',
    tokens: { token: 'token' },
    isIssue: false,
    issue: { number: 42, isIssueComment: false, isIssue: false },
    isPullRequest: false,
    pullRequest: {
      number: 42,
      head: 'feature/42-work',
      base: 'develop',
      isPullRequestReviewComment: false,
      isPullRequest: false,
    },
    commit: { branch: '' },
    branches: {
      featureTree: 'feature',
      bugfixTree: 'bugfix',
      hotfixTree: 'hotfix',
      releaseTree: 'release',
      docsTree: 'docs',
      choreTree: 'chore',
    },
    labels: {
      feature: 'feature', enhancement: 'enhancement', bugfix: 'bugfix', bug: 'bug',
      hotfix: 'hotfix', release: 'release', docs: 'docs', documentation: 'documentation',
      chore: 'chore', maintenance: 'maintenance', currentPullRequestLabels: [], currentIssueLabels: [],
      lifecycle: { aiProcessing: 'state:ai-processing' },
      completionProtectedLabels: ['branched', 'SDD', 'contract-change'],
    },
    release: { active: false },
    hotfix: { active: false },
    currentConfiguration: {},
    isPush: false,
  };
  return {
    ...base,
    ...overrides,
    singleAction: { ...base.singleAction, ...(overrides.singleAction as object | undefined) },
    issue: { ...base.issue, ...(overrides.issue as object | undefined) },
    pullRequest: { ...base.pullRequest, ...(overrides.pullRequest as object | undefined) },
  } as unknown as Execution;
}

const latestTagQueryPort = {} as LatestTagQueryPort;
const projectBoardCommandPort = {} as ProjectBoardCommandPort;

const runMain = (execution: Execution) => productionMainRun(
  execution,
  projectBoardCommandPort,
  latestTagQueryPort,
  'github-workflow',
);

const runMainWithActivity = (execution: Execution) => productionMainRun(
  execution,
  projectBoardCommandPort,
  latestTagQueryPort,
  'github-workflow',
  undefined,
  {
    start: mockAgentActivityStart,
    finish: mockAgentActivityFinish,
  } as unknown as SynchronizeAgentActivityUseCase,
);

const runMainWithLifecycle = (execution: Execution) => productionMainRun(
  execution,
  projectBoardCommandPort,
  latestTagQueryPort,
  'github-workflow',
  { invoke: mockLifecycleStateInvoke } as never,
);

const originalRunId = process.env.GITHUB_RUN_ID;
const originalWorkflow = process.env.GITHUB_WORKFLOW;
const originalWorkflowRef = process.env.GITHUB_WORKFLOW_REF;
const originalGithubActions = process.env.GITHUB_ACTIONS;
const nativeEnvironment = ['GITHUB_WORKFLOW_SHA', 'GITHUB_JOB', 'GITHUB_EVENT_NAME', 'GITHUB_REF'] as const;
const originalNativeEnvironment = nativeEnvironment.map(name => [name, process.env[name]] as const);

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('mainRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Verification deliberately strips live workflow identity. Each queue case
    // supplies its own fixture rather than inheriting its parent Actions job.
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_WORKFLOW;
    delete process.env.GITHUB_WORKFLOW_REF;
    delete process.env.GITHUB_ACTIONS;
    for (const name of nativeEnvironment) delete process.env[name];
    mockWaitForPreviousWorkflowRunsInvoke.mockResolvedValue(undefined);
    mockSingleActionInvoke.mockResolvedValue([]);
    mockIssueCommentInvoke.mockResolvedValue([]);
    mockIssueInvoke.mockResolvedValue([]);
    mockPullRequestReviewCommentInvoke.mockResolvedValue([]);
    mockPullRequestInvoke.mockResolvedValue([]);
    mockCommitInvoke.mockResolvedValue([]);
    mockSetupExecutionInvoke.mockImplementation(async (context) => unresolvedSetupResult(context));
    mockAgentActivityStart.mockResolvedValue(undefined);
    mockAgentActivityFinish.mockResolvedValue(undefined);
    mockLifecycleStateInvoke.mockResolvedValue({ results: [] });
  });

  afterEach(() => {
    restoreEnvironmentVariable('GITHUB_RUN_ID', originalRunId);
    restoreEnvironmentVariable('GITHUB_WORKFLOW', originalWorkflow);
    restoreEnvironmentVariable('GITHUB_WORKFLOW_REF', originalWorkflowRef);
    restoreEnvironmentVariable('GITHUB_ACTIONS', originalGithubActions);
    for (const [name, value] of originalNativeEnvironment) restoreEnvironmentVariable(name, value);
  });

  it('delegates setup to the composed use case and clears accumulated logs', async () => {
    const execution = mockExecution();
    await runMain(execution);
    expect(createSetupExecutionUseCase).toHaveBeenCalledWith(latestTagQueryPort, {
      owner: 'org',
      repository: 'repo',
      token: 'token',
    });
    const context = mockSetupExecutionInvoke.mock.calls[0][0];
    expect(context).toMatchObject({ issueNumber: 42, tokenUser: 'user' });
    expect(context).not.toHaveProperty('tokens');
    expect(context).not.toHaveProperty('owner');
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.branches)).toBe(true);
    expect(logger.clearAccumulatedLogs).toHaveBeenCalledTimes(1);
    expect(createMainRunRouteCompositionRoot).toHaveBeenCalledWith(projectBoardCommandPort, 'github-workflow', undefined);
  });

  it('rejects an execution without repository context before calling use cases', async () => {
    const execution = mockExecution({ owner: '', repo: '' });

    await expect(runMain(execution)).rejects.toThrow(
      'Repository context requires a non-empty owner and repository.',
    );
    expect(mockSetupExecutionInvoke).not.toHaveBeenCalled();
    expect(mockWaitForPreviousWorkflowRunsInvoke).not.toHaveBeenCalled();
  });

  it('waits for previous runs in GitHub Actions', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_RUN_ID = '200';
    process.env.GITHUB_WORKFLOW = 'CI';
    process.env.GITHUB_WORKFLOW_REF = 'org/repo/.github/workflows/copilot_issue.yml@refs/heads/master';
    const execution = mockExecution({ welcome: undefined });
    await runMain(execution);
    expect(createWaitForPreviousWorkflowRunsUseCase).toHaveBeenCalledWith('token');
    expect(mockWaitForPreviousWorkflowRunsInvoke).toHaveBeenCalledWith({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowIdentifier: 'copilot_issue.yml',
    });
  });

  function nativeRunEnvironment() {
    Object.assign(process.env, {
      GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '200', GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_WORKFLOW_REF: 'org/repo/.github/workflows/copilot_pull_request.yml@refs/heads/main',
      GITHUB_WORKFLOW_SHA: 'a'.repeat(40), GITHUB_JOB: 'copilot-pull-requests',
    });
  }

  it.each(['.github/workflows', 'setup/workflows'])(
    'replays scheduler inversion before setup using the native contract in %s', async directory => {
      nativeRunEnvironment();
      const order: string[] = [];
      const source = readFileSync(`${directory}/copilot_pull_request.yml`, 'utf8');
      const getContent = jest.fn(async () => {
        order.push('proof');
        return { data: { type: 'file', encoding: 'base64', content: Buffer.from(source).toString('base64') } };
      });
      // An older PR A is queued and cannot acquire this runner while B holds it.
      const iterator = jest.fn(async function* () {
        yield { data: { workflow_runs: [{ id: 199, status: 'queued' }] } };
      });
      const delay = { wait: jest.fn() };
      const clock = { nowMilliseconds: () => 0 };
      const native = new NativeWorkflowCoordinationRepository({ rest: { repos: { getContent } } }, {
        delayPort: delay, clock, random: { next: () => 0.5 },
      });
      const predecessors = new ActivePreviousWorkflowRunsRepository({
        rest: { actions: { listWorkflowRuns: jest.fn() } }, paginate: { iterator },
      });
      mockWaitForPreviousWorkflowRunsInvoke.mockImplementation((query: PreviousWorkflowRunsQuery) =>
        new WaitForPreviousWorkflowRunsUseCase(predecessors, delay, {
          noActivePreviousRuns: jest.fn(), waitingForPreviousRuns: jest.fn(),
        }, undefined, clock, undefined, native).invoke(query));
      mockSetupExecutionInvoke.mockImplementation(async context => {
        order.push('setup'); return unresolvedSetupResult(context);
      });
      await runMain(mockExecution({ isPullRequest: true, eventName: 'pull_request', inputs: { pull_request: { number: 22 } } }));
      expect(order).toEqual(['proof', 'setup']);
      expect(iterator).not.toHaveBeenCalled();
      expect(delay.wait).not.toHaveBeenCalled();
      expect(mockPullRequestInvoke).toHaveBeenCalledTimes(1);
      expect(getContent).toHaveBeenCalledWith({ owner: 'org', repo: 'repo',
        path: '.github/workflows/copilot_pull_request.yml', ref: 'a'.repeat(40) });
    },
  );

  it('retains the mutation fence before setup for a custom job without native coordination', async () => {
    nativeRunEnvironment();
    const order: string[] = [];
    let predecessorActive = true;
    const iterator = jest.fn(async function* () {
      yield { data: { workflow_runs: predecessorActive ? [{ id: 199, status: 'queued' }] : [] } };
    });
    const delay = { wait: jest.fn(async () => { order.push('wait'); predecessorActive = false; }) };
    const clock = { nowMilliseconds: () => 0 };
    const native = new NativeWorkflowCoordinationRepository({ rest: { repos: {
      getContent: jest.fn().mockResolvedValue({ data: { type: 'file', encoding: 'base64',
        content: Buffer.from('jobs: { copilot-pull-requests: { steps: [] } }').toString('base64') } }),
    } } }, { delayPort: delay, clock, random: { next: () => 0.5 } });
    const predecessors = new ActivePreviousWorkflowRunsRepository({
      rest: { actions: { listWorkflowRuns: jest.fn() } }, paginate: { iterator },
    }, undefined, undefined, clock);
    mockWaitForPreviousWorkflowRunsInvoke.mockImplementation((query: PreviousWorkflowRunsQuery) =>
      new WaitForPreviousWorkflowRunsUseCase(predecessors, delay, {
        noActivePreviousRuns: jest.fn(), waitingForPreviousRuns: jest.fn(),
      }, undefined, clock, { next: () => 0.5 }, native).invoke(query));
    mockSetupExecutionInvoke.mockImplementation(async context => {
      expect(predecessorActive).toBe(false); order.push('setup'); return unresolvedSetupResult(context);
    });
    await runMain(mockExecution({ inputs: { pull_request: { number: 21 } } }));
    expect(order).toEqual(['wait', 'setup']);
  });

  it('fails before setup with sanitized diagnostics when native proof cannot be read', async () => {
    nativeRunEnvironment();
    const native = new NativeWorkflowCoordinationRepository({ rest: { repos: {
      getContent: jest.fn().mockRejectedValue({ status: 403, message: 'secret-provider-body' }),
    } } }, { delayPort: { wait: jest.fn() }, clock: { nowMilliseconds: () => 0 }, random: { next: () => 0.5 } });
    mockWaitForPreviousWorkflowRunsInvoke.mockImplementation((query: PreviousWorkflowRunsQuery) =>
      new WaitForPreviousWorkflowRunsUseCase({ countActivePreviousRuns: jest.fn() }, { wait: jest.fn() }, {
        noActivePreviousRuns: jest.fn(), waitingForPreviousRuns: jest.fn(),
      }, undefined, { nowMilliseconds: () => 0 }, undefined, native).invoke(query));
    await expect(runMain(mockExecution({ inputs: { pull_request: { number: 21 } } })))
      .rejects.toThrow('Workflow queue check failed; sequential execution was not bypassed.');
    expect(mockSetupExecutionInvoke).not.toHaveBeenCalled();
    expect(mockPullRequestInvoke).not.toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalledWith(expect.stringContaining('secret-provider-body'));
  });

  it('projects only GitHub workflow metadata and omits native delegation for single actions', () => {
    nativeRunEnvironment();
    const repository = { owner: 'org', repo: 'repo' };
    const query = buildPreviousWorkflowRunsQuery(repository, { isSingleAction: false, pullRequestNumber: 21 });
    expect(query.nativeCoordination).toMatchObject({ workflowRevision: 'a'.repeat(40),
      jobId: 'copilot-pull-requests', eventName: 'pull_request', pullRequestNumber: 21 });
    expect(Object.isFrozen(query.nativeCoordination)).toBe(true);
    expect(buildPreviousWorkflowRunsQuery(repository, { isSingleAction: true }).nativeCoordination).toBeUndefined();
  });

  it('refuses admission before setup when pinned metadata lacks the workflow identity', async () => {
    nativeRunEnvironment();
    delete process.env.GITHUB_WORKFLOW_REF;
    delete process.env.GITHUB_EVENT_NAME;

    const query = buildPreviousWorkflowRunsQuery({ owner: 'org', repo: 'repo' }, { isSingleAction: false });
    expect(query.nativeCoordination).toMatchObject({ workflowRef: '', eventName: '' });
    expect(query.workflowIdentifier).toBeUndefined();
    await expect(runMain(mockExecution())).rejects.toThrow('GitHub workflow identifier is unavailable');
    expect(createWaitForPreviousWorkflowRunsUseCase).not.toHaveBeenCalled();
    expect(mockSetupExecutionInvoke).not.toHaveBeenCalled();
  });

  it('retains the predecessor fence when runner metadata has no event name', async () => {
    nativeRunEnvironment();
    delete process.env.GITHUB_EVENT_NAME;
    const countActivePreviousRuns = jest.fn().mockResolvedValue(0);
    const getContent = jest.fn();
    const clock = { nowMilliseconds: () => 0 };
    const native = new NativeWorkflowCoordinationRepository({ rest: { repos: { getContent } } }, {
      clock, delayPort: { wait: jest.fn() }, random: { next: () => 0.5 },
    });
    mockWaitForPreviousWorkflowRunsInvoke.mockImplementation(query =>
      new WaitForPreviousWorkflowRunsUseCase({ countActivePreviousRuns }, { wait: jest.fn() }, {
        noActivePreviousRuns: jest.fn(), waitingForPreviousRuns: jest.fn(), providerRetry: jest.fn(),
      }, undefined, clock, undefined, native).invoke(query));

    await runMain(mockExecution({ isPullRequest: true, inputs: { pull_request: { number: 21 } } }));

    expect(getContent).not.toHaveBeenCalled();
    expect(countActivePreviousRuns).toHaveBeenCalledTimes(1);
    expect(mockSetupExecutionInvoke).toHaveBeenCalledTimes(1);
  });

  it('does not queue the issue-comment single action so a failed queue gate can still report', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_WORKFLOW_REF;
    const execution = mockExecution({
      isSingleAction: true,
      singleAction: {
        validSingleAction: true,
        isSingleActionWithoutIssue: false,
        isPublishIssueCommentAction: true,
      },
    });

    await runMain(execution);

    expect(createWaitForPreviousWorkflowRunsUseCase).not.toHaveBeenCalled();
    expect(mockSetupExecutionInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 42 }));
    expect(mockSingleActionInvoke).toHaveBeenCalledWith(execution);
  });

  it('waits before setup so setup cannot overlap a previous mutation run', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_RUN_ID = '200';
    process.env.GITHUB_WORKFLOW_REF = 'org/repo/.github/workflows/copilot_issue.yml@refs/heads/master';
    const order: string[] = [];
    mockWaitForPreviousWorkflowRunsInvoke.mockImplementation(async () => {
      order.push('wait');
    });
    mockSetupExecutionInvoke.mockImplementation(async (context) => {
      order.push('setup');
      return unresolvedSetupResult(context);
    });

    await runMain(mockExecution({ welcome: undefined }));

    expect(order).toEqual(['wait', 'setup']);
  });

  it('fails closed when a GitHub Actions run has no numeric run identity', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    delete process.env.GITHUB_RUN_ID;

    await expect(runMain(mockExecution({ welcome: undefined }))).rejects.toThrow(
      'GitHub workflow identity is unavailable; refusing to bypass sequential execution.',
    );
    expect(createWaitForPreviousWorkflowRunsUseCase).not.toHaveBeenCalled();
    expect(mockSetupExecutionInvoke).not.toHaveBeenCalled();
  });

  it('fails closed when a GitHub Actions run has no workflow identifier', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_RUN_ID = '200';
    delete process.env.GITHUB_WORKFLOW_REF;

    await expect(runMain(mockExecution({ welcome: undefined }))).rejects.toThrow(
      'GitHub workflow identifier is unavailable; refusing to bypass sequential execution.',
    );
    expect(createWaitForPreviousWorkflowRunsUseCase).not.toHaveBeenCalled();
    expect(mockSetupExecutionInvoke).not.toHaveBeenCalled();
  });

  it('still queues a GitHub workflow when a welcome message is configured', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_RUN_ID = '200';
    process.env.GITHUB_WORKFLOW_REF = 'org/repo/.github/workflows/copilot_issue.yml@refs/heads/master';
    const execution = mockExecution({
      welcome: { title: 'Hi', messages: ['Welcome'] },
      isPush: true,
    });
    await runMain(execution);
    expect(createWaitForPreviousWorkflowRunsUseCase).toHaveBeenCalledWith('token');
    expect(mockCommitInvoke).toHaveBeenCalled();
  });

  it('does not query the GitHub workflow queue outside GitHub Actions', async () => {
    delete process.env.GITHUB_ACTIONS;
    await runMain(mockExecution({ welcome: undefined }));
    expect(createWaitForPreviousWorkflowRunsUseCase).not.toHaveBeenCalled();
    expect(mockSetupExecutionInvoke).toHaveBeenCalled();
  });

  it('logs welcome boxen and runs SingleActionUseCase when welcome and isSingleAction', async () => {
    const logInfo = require('../../utils/logger').logInfo;
    const execution = mockExecution({
      welcome: { title: 'Welcome', messages: ['Step 1', 'Step 2'] },
      issueNumber: 42,
      runnedByToken: false,
      isSingleAction: true,
      singleAction: { validSingleAction: true, isSingleActionWithoutIssue: false, enabledSingleAction: true },
    });
    mockSingleActionInvoke.mockResolvedValue([new Result({ id: 's', success: true })]);

    const results = await runMain(execution);

    expect(logInfo).toHaveBeenCalledWith(expect.any(String));
    expect(mockSingleActionInvoke).toHaveBeenCalledWith(execution);
    expect(results.length).toBeGreaterThan(0);
  });

  it('runs SingleActionUseCase when runnedByToken and valid single action', async () => {
    const execution = mockExecution({
      runnedByToken: true,
      isSingleAction: true,
      singleAction: {
        validSingleAction: true,
        isSingleActionWithoutIssue: false,
        enabledSingleAction: true,
      },
    });
    const expected = [new Result({ id: 's', success: true, executed: true })];
    mockSingleActionInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockSingleActionInvoke).toHaveBeenCalledWith(execution);
    expect(results).toEqual(expected);
    expect(mockCommitInvoke).not.toHaveBeenCalled();
  });

  it('returns empty when runnedByToken but not valid single action', async () => {
    const execution = mockExecution({
      runnedByToken: true,
      isSingleAction: false,
    });

    const results = await runMain(execution);

    expect(results).toEqual([]);
    expect(mockSingleActionInvoke).not.toHaveBeenCalled();
  });

  it('runs SingleActionUseCase when issueNumber -1 and isSingleActionWithoutIssue', async () => {
    const execution = mockExecution({
      issueNumber: -1,
      isSingleAction: true,
      singleAction: {
        validSingleAction: false,
        isSingleActionWithoutIssue: true,
        enabledSingleAction: true,
      },
    });
    mockSingleActionInvoke.mockResolvedValue([new Result({ id: 't', success: true })]);

    const results = await runMain(execution);

    expect(mockSingleActionInvoke).toHaveBeenCalledWith(execution);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty when issueNumber -1 and not single action without issue', async () => {
    const execution = mockExecution({
      issueNumber: -1,
      isSingleAction: false,
    });

    const results = await runMain(execution);

    expect(results).toEqual([]);
    expect(mockSingleActionInvoke).not.toHaveBeenCalled();
  });

  it('dispatches an unlinked pull request instead of treating it as a targetless action', async () => {
    const execution = mockExecution({
      eventName: 'pull_request',
      issueNumber: -1,
      isPullRequest: true,
      pullRequest: { number: 84, isPullRequest: true },
    });
    mockPullRequestInvoke.mockResolvedValue([new Result({ id: 'pr', success: true })]);

    const results = await runMain(execution);

    expect(mockPullRequestInvoke).toHaveBeenCalledWith(execution);
    expect(mockSingleActionInvoke).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('runs IssueCommentUseCase when isIssue and issue comment', async () => {
    const execution = mockExecution({
      isIssue: true,
      issue: { isIssueComment: true, isIssue: false },
    });
    const expected = [new Result({ id: 'ic', success: true })];
    mockIssueCommentInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockIssueCommentInvoke).toHaveBeenCalledWith(execution);
    expect(results).toEqual(expected);
  });

  it('runs IssueCommentUseCase for a PR conversation comment without treating it as a PR event', async () => {
    const execution = mockExecution({
      isIssue: false,
      isPullRequest: true,
      issue: { isIssueComment: true, isIssue: false },
      pullRequest: { isPullRequestReviewComment: false, isPullRequest: true },
    });
    const expected = [new Result({ id: 'pr-conversation', success: true })];
    mockIssueCommentInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockIssueCommentInvoke).toHaveBeenCalledWith(execution);
    expect(mockPullRequestInvoke).not.toHaveBeenCalled();
    expect(results).toEqual(expected);
  });

  it('runs IssueUseCase when isIssue and not issue comment', async () => {
    const execution = mockExecution({
      isIssue: true,
      issue: { isIssueComment: false, isIssue: true },
    });
    const expected = [new Result({ id: 'i', success: true })];
    mockIssueInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockIssueInvoke).toHaveBeenCalledWith(execution);
    expect(results).toEqual(expected);
  });

  it('projects lifecycle facts and applies only the explicit label patch', async () => {
    const execution = mockExecution({
      eventName: 'issues',
      inputs: { action: 'opened' },
      isIssue: true,
      issue: { number: 42, isIssueComment: false, isIssue: true, opened: true, descriptionEdited: false },
      labels: {
        ...mockExecution().labels,
        currentIssueLabels: ['bug'],
      },
    });
    mockIssueInvoke.mockResolvedValue([new Result({ id: 'issue', success: true })]);
    mockLifecycleStateInvoke.mockResolvedValue({
      results: [new Result({ id: 'lifecycle', success: true, executed: true })],
      labelPatch: { target: { kind: 'issue', number: 42 }, labels: ['bug', 'state:planned'] },
    });

    const results = await runMainWithLifecycle(execution);

    expect(mockLifecycleStateInvoke).toHaveBeenCalledWith({
      context: expect.objectContaining({
        eventName: 'issues',
        action: 'opened',
        target: expect.objectContaining({ kind: 'issue', number: 42, labels: ['bug'] }),
      }),
      results: [expect.objectContaining({ id: 'issue' })],
    });
    expect(execution.labels.currentIssueLabels).toEqual(['bug', 'state:planned']);
    expect(results.map(result => result.id)).toEqual(['issue', 'lifecycle']);
  });

  it('applies an explicit pull-request lifecycle patch to the PR label cache', async () => {
    const execution = mockExecution({
      eventName: 'pull_request',
      inputs: { action: 'synchronize' },
      isPullRequest: true,
      pullRequest: {
        number: 42, isPullRequestReviewComment: false, isPullRequest: true,
        isMerged: false, isClosed: false,
      },
    });
    mockLifecycleStateInvoke.mockResolvedValue({
      results: [],
      labelPatch: { target: { kind: 'pull-request', number: 42 }, labels: ['state:reviewing'] },
    });

    await runMainWithLifecycle(execution);

    expect(execution.labels.currentPullRequestLabels).toEqual(['state:reviewing']);
  });

  it('still reconciles pull-request lifecycle labels for an edited review event', async () => {
    const execution = mockExecution({
      eventName: 'pull_request_review',
      inputs: { action: 'edited' },
      isPullRequest: true,
      pullRequest: { number: 42, isPullRequestReviewComment: false, isPullRequest: true },
    });
    mockPullRequestInvoke.mockResolvedValue([]);
    mockLifecycleStateInvoke.mockResolvedValue({
      results: [],
      labelPatch: { target: { kind: 'pull-request', number: 42 }, labels: ['state:reviewing'] },
    });

    await runMainWithLifecycle(execution);

    expect(mockPullRequestInvoke).toHaveBeenCalledWith(execution);
    expect(mockLifecycleStateInvoke).toHaveBeenCalledWith({
      context: expect.objectContaining({ eventName: 'pull_request_review', action: 'edited' }),
      results: [],
    });
    expect(execution.labels.currentPullRequestLabels).toEqual(['state:reviewing']);
  });

  it('leaves both label caches unchanged when lifecycle synchronization returns no patch', async () => {
    const execution = mockExecution({
      eventName: 'issues',
      inputs: { action: 'edited' },
      isIssue: true,
      issue: { number: 42, isIssueComment: false, isIssue: true, opened: false, descriptionEdited: true },
      labels: {
        ...mockExecution().labels,
        currentIssueLabels: ['state:planned'],
        currentPullRequestLabels: ['state:reviewing'],
      },
    });
    mockIssueInvoke.mockResolvedValue([new Result({ id: 'issue', success: true })]);
    mockLifecycleStateInvoke.mockResolvedValue({ results: [] });

    await runMainWithLifecycle(execution);

    expect(execution.labels.currentIssueLabels).toEqual(['state:planned']);
    expect(execution.labels.currentPullRequestLabels).toEqual(['state:reviewing']);
  });

  it('runs PullRequestReviewCommentUseCase when isPullRequest and review comment', async () => {
    const execution = mockExecution({
      isPullRequest: true,
      pullRequest: { isPullRequestReviewComment: true, isPullRequest: false },
    });
    const expected = [new Result({ id: 'prc', success: true })];
    mockPullRequestReviewCommentInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockPullRequestReviewCommentInvoke).toHaveBeenCalledWith(execution);
    expect(results).toEqual(expected);
  });

  it('runs PullRequestUseCase when isPullRequest and not review comment', async () => {
    const execution = mockExecution({
      isPullRequest: true,
      pullRequest: { isPullRequestReviewComment: false, isPullRequest: true },
    });
    const expected = [new Result({ id: 'pr', success: true })];
    mockPullRequestInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockPullRequestInvoke).toHaveBeenCalledWith(execution);
    expect(results).toEqual(expected);
  });

  it('runs CommitUseCase when isPush', async () => {
    const execution = mockExecution({ isPush: true });
    const expected = [new Result({ id: 'c', success: true })];
    mockCommitInvoke.mockResolvedValue(expected);

    const results = await runMain(execution);

    expect(mockCommitInvoke).toHaveBeenCalledWith(execution);
    expect(results).toEqual(expected);
  });

  it('returns a successful no-op for passive disabled work before runtime or route mutation', async () => {
    const execution = mockExecution({
      eventName: 'issues',
      isIssue: true,
      issue: { number: 42, isIssue: true, isIssueComment: false, labeled: false },
    });
    mockSetupExecutionInvoke.mockImplementation(async context => configuredSetupResult(
      context,
      { status: 'disabled', kind: 'bugfix' },
    ));
    const prepareRuntime = jest.fn();

    const results = await productionMainRun(
      execution,
      projectBoardCommandPort,
      latestTagQueryPort,
      'github-workflow',
      undefined,
      undefined,
      prepareRuntime,
    );

    expect(results).toEqual([expect.objectContaining({ id: 'IssueWorkflowAdmission', success: true, executed: false })]);
    expect(prepareRuntime).not.toHaveBeenCalled();
    expect(mockIssueInvoke).not.toHaveBeenCalled();
    expect(createMainRunRouteCompositionRoot).not.toHaveBeenCalled();
  });

  it('returns a blocking result for explicit unmanaged work before runtime or route mutation', async () => {
    const execution = mockExecution({
      eventName: 'issue_comment',
      isIssue: true,
      issue: { number: 42, isIssue: false, isIssueComment: true, labeled: false },
    });
    mockSetupExecutionInvoke.mockImplementation(async context => configuredSetupResult(
      context,
      { status: 'unmanaged', reason: 'no-recognized-kind' },
    ));
    const prepareRuntime = jest.fn();

    const results = await productionMainRun(
      execution,
      projectBoardCommandPort,
      latestTagQueryPort,
      'github-workflow',
      undefined,
      undefined,
      prepareRuntime,
    );

    expect(results[0]).toMatchObject({ id: 'IssueWorkflowAdmission', success: false, executed: false });
    expect(results[0].errors[0]).toMatchObject({ code: 'configuration.invalid' });
    expect(prepareRuntime).not.toHaveBeenCalled();
    expect(mockIssueCommentInvoke).not.toHaveBeenCalled();
  });

  it('allows a disabled managed pull request to continue without agent preparation', async () => {
    const execution = mockExecution({
      eventName: 'pull_request',
      isPullRequest: true,
      pullRequest: { number: 77, head: 'feature/42-work', base: 'develop', isPullRequest: true, isPullRequestReviewComment: false },
    });
    mockSetupExecutionInvoke.mockImplementation(async context => configuredSetupResult(
      context,
      { status: 'disabled', kind: 'feature' },
      { branchType: 'feature', workingBranch: 'feature/42-work' },
    ));
    const prepareRuntime = jest.fn();

    await productionMainRun(
      execution,
      projectBoardCommandPort,
      latestTagQueryPort,
      'github-workflow',
      undefined,
      undefined,
      prepareRuntime,
    );

    expect(execution.issueWorkflowRuntimeMode).toBe('continuation-only');
    expect(prepareRuntime).toHaveBeenCalledWith(execution);
    expect(mockPullRequestInvoke).toHaveBeenCalledWith(execution);
  });

  it('tracks agent activity around an agent-backed route', async () => {
    const order: string[] = [];
    mockAgentActivityStart.mockImplementation(async () => {
      order.push('activity-start');
      return { target: { kind: 'pull-request', number: 42 }, labels: ['state:ai-processing'] };
    });
    mockCommitInvoke.mockImplementation(async () => { order.push('route'); return []; });
    mockAgentActivityFinish.mockImplementation(async () => {
      order.push('activity-finish');
      return { target: { kind: 'issue', number: 42 }, labels: ['state:ready'] };
    });
    const execution = mockExecution({
      eventName: 'push',
      isPush: true,
      commit: { commits: [{ id: 'commit-1' }] },
      ai: {
        getAgentConfiguration: jest.fn(() => ({ model: 'model' })),
        getPullRequestDescriptionMode: jest.fn(() => 'disabled'),
      },
    });

    await runMainWithActivity(execution);

    expect(order).toEqual(['activity-start', 'route', 'activity-finish']);
    expect(execution.labels.currentPullRequestLabels).toEqual(['state:ai-processing']);
    expect(execution.labels.currentIssueLabels).toEqual(['state:ready']);
  });

  it.each([
    undefined,
    { labels: ['state:ready'] },
    { target: { kind: 'issue', number: 42 } },
  ])('leaves label caches intact when activity returns no complete patch (%j)', async outcome => {
    mockAgentActivityStart.mockResolvedValue(outcome);
    mockAgentActivityFinish.mockResolvedValue(outcome);
    const execution = mockExecution({
      eventName: 'push', isPush: true, commit: { commits: [{ id: 'commit-1' }] },
      ai: {
        getAgentConfiguration: jest.fn(() => ({ model: 'model' })),
        getPullRequestDescriptionMode: jest.fn(() => 'disabled'),
      },
    });

    await runMainWithActivity(execution);

    expect(mockAgentActivityStart).toHaveBeenCalledTimes(1);
    expect(mockAgentActivityFinish).toHaveBeenCalledTimes(1);
    expect(mockCommitInvoke).toHaveBeenCalledWith(execution);
    expect(execution.labels.currentIssueLabels).toEqual([]);
    expect(execution.labels.currentPullRequestLabels).toEqual([]);
  });

  it.each([
    ['in-progress', false],
    ['deploy', false],
    ['unrelated', true],
  ])('blocks explicit disabled-work intent for %s while leaving unrelated callbacks idle', async (labelAdded, success) => {
    const execution = mockExecution({
      eventName: 'issues', isIssue: true,
      issue: { labeled: true, labelAdded },
    });
    execution.labels.deploy = 'deploy';
    mockSetupExecutionInvoke.mockImplementation(async context => configuredSetupResult(
      context, { status: 'disabled', kind: 'feature' },
    ));

    const results = await runMain(execution);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'IssueWorkflowAdmission', success, executed: false });
    expect(mockIssueInvoke).not.toHaveBeenCalled();
  });

  it('renders a bounded fallback when an admission decision has no optional message', async () => {
    const decision = jest.spyOn(issueWorkflowRuntimePolicy, 'decideIssueWorkflowRuntime')
      .mockReturnValueOnce({ mode: 'noop' });
    try {
      const results = await runMain(mockExecution());
      expect(results[0].steps).toEqual(['⏭️ Issue workflow admission stopped this run.']);
      expect(mockIssueInvoke).not.toHaveBeenCalled();
    } finally {
      decision.mockRestore();
    }
  });

  it('summarizes route results that omit optional step details', async () => {
    const results = [{ id: 'push', success: true, executed: true }] as Result[];
    mockCommitInvoke.mockResolvedValue(results);

    expect(await runMain(mockExecution({ isPush: true }))).toEqual(results);
    expect(logInfo).toHaveBeenCalledWith('Main run finished. Results: 1, total steps: 0.');
  });

  it.each(['help', 'status'])('dispatches deterministic %s without an agent activity mutation', async command => {
    const execution = mockExecution({
      eventName: 'issue_comment', isIssue: true,
      issue: { isIssueComment: true, isIssue: false, commentBody: `/copilot ${command}` },
      ai: {
        getAgentConfiguration: jest.fn(() => ({ model: 'model' })),
        getPullRequestDescriptionMode: jest.fn(() => 'disabled'),
      },
    });
    await runMainWithActivity(execution);
    expect(mockIssueCommentInvoke).toHaveBeenCalledWith(execution);
    expect(mockAgentActivityStart).not.toHaveBeenCalled();
    expect(mockAgentActivityFinish).not.toHaveBeenCalled();
  });

  it('returns a semantic failure when the action route is not handled', async () => {
    const execution = mockExecution({
      isIssue: false,
      isPullRequest: false,
      isPush: false,
    });

    const results = await runMain(execution);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('Main run finished. Results: 1, total steps: 0.');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(results[0].errors[0]).toMatchObject({ code: 'workflow.invalid-event' });
  });

  it('returns a semantic failure when a use case throws', async () => {
    const execution = mockExecution({ isPush: true });
    mockCommitInvoke.mockRejectedValue(new Error('Commit failed'));

    const results = await runMain(execution);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0]).toMatchObject({ code: 'workflow.failed', message: 'Main run failed.' });
  });

  it('does not expose a non-Error thrown value in the action failure', async () => {
    const execution = mockExecution({ isPush: true });
    mockCommitInvoke.mockRejectedValue('plain string error');

    const results = await runMain(execution);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].errors[0]).toMatchObject({ code: 'workflow.failed', message: 'Main run failed.' });
    expect(results[0].errors[0].message).not.toContain('plain string error');
  });

  it('propagates a canonical queue failure without exposing provider diagnostics', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_RUN_ID = '200';
    process.env.GITHUB_WORKFLOW_REF = 'org/repo/.github/workflows/copilot_issue.yml@refs/heads/master';
    const markers = [
      'provider-message-marker',
      'response-body-marker',
      'https://api.example.test/repos/org/repo?token=url-marker',
      'authorization-header-marker',
      'credential-marker',
    ];
    const providerError = Object.assign(new Error(markers.join(' ')), {
      response: {
        data: { message: markers[1] },
        headers: { authorization: markers[3], location: markers[2] },
      },
      request: { headers: { authorization: markers[3] } },
    });
    mockWaitForPreviousWorkflowRunsInvoke.mockRejectedValue(providerError);
    const execution = mockExecution({ welcome: undefined });

    await expect(runMain(execution)).rejects.toThrow(
      'Workflow queue check failed; sequential execution was not bypassed.',
    );

    const logCalls = logger.logError.mock.calls.flat().map(String).join('\n');
    expect(logCalls).toContain('Workflow queue check failed; sequential execution was not bypassed.');
    for (const marker of markers) expect(logCalls).not.toContain(marker);
  });
});


describe('terminal issue lifecycle route', () => {
  afterAll(() => {
    restoreEnvironmentVariable('GITHUB_RUN_ID', originalRunId); restoreEnvironmentVariable('GITHUB_WORKFLOW', originalWorkflow);
    restoreEnvironmentVariable('GITHUB_WORKFLOW_REF', originalWorkflowRef); restoreEnvironmentVariable('GITHUB_ACTIONS', originalGithubActions);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GITHUB_RUN_ID; delete process.env.GITHUB_WORKFLOW;
    delete process.env.GITHUB_WORKFLOW_REF; delete process.env.GITHUB_ACTIONS;
    mockSetupExecutionInvoke.mockImplementation(async context => unresolvedSetupResult(context));
  });
  it.each([true, false])('retires closed work without agent/lifecycle/open-work effects, including failure (%s)', async success => {
    const result = new Result({ id: 'retire', success, executed: success });
    mockClosedIssueRetireInvoke.mockResolvedValue([result]);
    const prepare = jest.fn();
    const execution = mockExecution({ eventName: 'issues', isIssue: true, inputs: { action: 'closed', issue: { number: 42, state: 'closed' } },
      locale: { issue: 'en-US' } });
    const actual = await productionMainRun(execution, projectBoardCommandPort, latestTagQueryPort, 'github-workflow',
      { invoke: mockLifecycleStateInvoke } as never, { start: mockAgentActivityStart, finish: mockAgentActivityFinish } as never, prepare);
    expect(actual).toEqual([result]);
    expect(mockClosedIssueRetireInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 42, locale: 'en-US', trustedBotLogin: 'user',
      completionLabels: expect.objectContaining({ lifecycle: expect.any(Object), protectedLabels: expect.any(Array) }) }));
    expect(prepare).not.toHaveBeenCalled(); expect(mockLifecycleStateInvoke).not.toHaveBeenCalled();
    expect(mockAgentActivityStart).not.toHaveBeenCalled(); expect(mockAgentActivityFinish).not.toHaveBeenCalled();
    expect(createMainRunRouteCompositionRoot).not.toHaveBeenCalled(); expect(mockIssueInvoke).not.toHaveBeenCalled();
  });
  it.each(['edited', 'labeled'])('ignores a closed issue %s callback without retirement or open-work effects', async action => {
    mockClosedIssueRetireInvoke.mockResolvedValue([]);
    const prepare = jest.fn();
    const execution = mockExecution({ eventName: 'issues', isIssue: true, inputs: { action, issue: { number: 42, state: 'closed' } },
      locale: { issue: 'en-US' } });
    const actual = await productionMainRun(execution, projectBoardCommandPort, latestTagQueryPort, 'github-workflow',
      { invoke: mockLifecycleStateInvoke } as never, { start: mockAgentActivityStart, finish: mockAgentActivityFinish } as never, prepare);
    expect(actual).toEqual([]);
    expect(mockClosedIssueRetireInvoke).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    expect(mockLifecycleStateInvoke).not.toHaveBeenCalled(); expect(mockAgentActivityStart).not.toHaveBeenCalled();
    expect(mockAgentActivityFinish).not.toHaveBeenCalled(); expect(createMainRunRouteCompositionRoot).not.toHaveBeenCalled();
    expect(mockIssueInvoke).not.toHaveBeenCalled();
  });
  it('can retire a closed issue even when current workflow labels are unmanaged', async () => {
    mockSetupExecutionInvoke.mockImplementation(async context => configuredSetupResult(context, { status: 'unmanaged' }));
    mockClosedIssueRetireInvoke.mockResolvedValue([]);
    await runMain(mockExecution({ eventName: 'issues', isIssue: true, inputs: { action: 'closed', issue: { number: 42, state: 'closed' } }, locale: { issue: 'en-US' } }));
    expect(mockClosedIssueRetireInvoke).toHaveBeenCalledTimes(1); expect(mockIssueInvoke).not.toHaveBeenCalled();
  });
});
