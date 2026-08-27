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
import { Result } from '../../data/model/result';
import { logInfo } from '../../utils/logger';

jest.mock('@actions/core', () => ({
  setFailed: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
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

jest.mock('../../infrastructure/composition/main_run_route_composition_root', () => ({
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
    setup: jest.fn().mockResolvedValue(undefined),
    welcome: undefined,
    runnedByToken: false,
    tokenUser: 'user',
    isSingleAction: false,
    singleAction: {
      validSingleAction: false,
      isSingleActionWithoutIssue: false,
      enabledSingleAction: false,
    },
    issueNumber: 42,
    owner: 'org',
    repo: 'repo',
    tokens: { token: 'token' },
    isIssue: false,
    issue: { isIssueComment: false, isIssue: false },
    isPullRequest: false,
    pullRequest: { isPullRequestReviewComment: false, isPullRequest: false },
    isPush: false,
    ...overrides,
  };
  return base as unknown as Execution;
}

const latestTagQueryPort = {} as LatestTagQueryPort;
const projectBoardCommandPort = {} as ProjectBoardCommandPort;

const runMain = (execution: Execution) => productionMainRun(
  execution,
  projectBoardCommandPort,
  latestTagQueryPort,
);

const originalRunId = process.env.GITHUB_RUN_ID;
const originalWorkflow = process.env.GITHUB_WORKFLOW;

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
    mockWaitForPreviousWorkflowRunsInvoke.mockResolvedValue(undefined);
    mockSingleActionInvoke.mockResolvedValue([]);
    mockIssueCommentInvoke.mockResolvedValue([]);
    mockIssueInvoke.mockResolvedValue([]);
    mockPullRequestReviewCommentInvoke.mockResolvedValue([]);
    mockPullRequestInvoke.mockResolvedValue([]);
    mockCommitInvoke.mockResolvedValue([]);
    mockSetupExecutionInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreEnvironmentVariable('GITHUB_RUN_ID', originalRunId);
    restoreEnvironmentVariable('GITHUB_WORKFLOW', originalWorkflow);
  });

  it('delegates setup to the composed use case and clears accumulated logs', async () => {
    const execution = mockExecution();
    await runMain(execution);
    expect(createSetupExecutionUseCase).toHaveBeenCalledWith(latestTagQueryPort);
    expect(mockSetupExecutionInvoke).toHaveBeenCalledWith(execution);
    expect(logger.clearAccumulatedLogs).toHaveBeenCalledTimes(1);
    expect(createMainRunRouteCompositionRoot).toHaveBeenCalledWith(projectBoardCommandPort);
  });

  it('waits for previous runs when welcome is false', async () => {
    process.env.GITHUB_RUN_ID = '200';
    process.env.GITHUB_WORKFLOW = 'CI';
    const execution = mockExecution({ welcome: undefined });
    await runMain(execution);
    expect(createWaitForPreviousWorkflowRunsUseCase).toHaveBeenCalledWith('token');
    expect(mockWaitForPreviousWorkflowRunsInvoke).toHaveBeenCalledWith({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
    });
  });

  it('skips wait when welcome is set', async () => {
    const execution = mockExecution({
      welcome: { title: 'Hi', messages: ['Welcome'] },
      isPush: true,
    });
    await runMain(execution);
    expect(createWaitForPreviousWorkflowRunsUseCase).not.toHaveBeenCalled();
    expect(mockCommitInvoke).toHaveBeenCalled();
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

  it('calls core.setFailed when action not handled', async () => {
    const execution = mockExecution({
      isIssue: false,
      isPullRequest: false,
      isPush: false,
    });

    const results = await runMain(execution);

    expect(core.setFailed).toHaveBeenCalledWith('Action not handled.');
    expect(logInfo).toHaveBeenCalledWith('Main run finished. Results: 0, total steps: 0.');
    expect(results).toEqual([]);
  });

  it('calls core.setFailed and returns [] when use case throws', async () => {
    const execution = mockExecution({ isPush: true });
    mockCommitInvoke.mockRejectedValue(new Error('Commit failed'));

    const results = await runMain(execution);

    expect(core.setFailed).toHaveBeenCalledWith('Commit failed');
    expect(results).toEqual([]);
  });

  it('calls core.setFailed with String(error) when use case throws non-Error', async () => {
    const execution = mockExecution({ isPush: true });
    mockCommitInvoke.mockRejectedValue('plain string error');

    const results = await runMain(execution);

    expect(core.setFailed).toHaveBeenCalledWith('plain string error');
    expect(results).toEqual([]);
  });

  it('exits process when workflow queue polling rejects and welcome is false', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    mockWaitForPreviousWorkflowRunsInvoke.mockRejectedValue(new Error('Queue error'));
    const execution = mockExecution({ welcome: undefined });

    await runMain(execution);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
