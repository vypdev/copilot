/**
 * Unit tests for runGitHubAction.
 * Mocks @actions/core, the project-board adapter, mainRun, and finish flow.
 */

import * as core from '@actions/core';
import * as projectBoardCompositionRoot from '../../infrastructure/composition/project_board_composition_root';
import * as executionBuilder from '../github_action_execution';
import * as agentRuntime from '../github_action_runtime';
import * as actionCompletion from '../github_action_completion';
import { runGitHubAction } from '../github_action';
import { ACTIONS } from '../../data/model/action_types';
import { INPUT_KEYS } from '../../application/contracts/input_keys';

jest.mock('@actions/github', () => ({
  context: {
    payload: {},
    eventName: 'workflow_dispatch',
    actor: 'test-actor',
    repo: { owner: 'test-owner', repo: 'test-repo' },
  },
}));

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setFailed: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));


const mockMainRun = jest.fn();
jest.mock('../common_action', () => ({
  mainRun: (...args: unknown[]) => mockMainRun(...args),
}));

const mockExecutionAdmissionInvoke = jest.fn();
jest.mock('../../infrastructure/composition/github_execution_admission_composition_root', () => ({
  createGithubExecutionAdmissionUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockExecutionAdmissionInvoke,
  })),
}));

const mockWaitForPreviousWorkflowRuns = jest.fn();
jest.mock('../main_run_lifecycle', () => ({
  WORKFLOW_QUEUE_FAILURE_MESSAGE: 'Workflow queue check failed; sequential execution was not bypassed.',
  WorkflowQueueFailureError: class WorkflowQueueFailureError extends Error {
    constructor() {
      super('Workflow queue check failed; sequential execution was not bypassed.');
    }
  },
  waitForPreviousWorkflowRuns: (...args: unknown[]) => mockWaitForPreviousWorkflowRuns(...args),
}));

const mockProvision = jest.fn();
jest.mock('../../data/repository/agent_cli_provisioner', () => ({
  AgentCliProvisioner: jest.fn().mockImplementation(() => ({ provision: mockProvision })),
}));

const mockPublishInvoke = jest.fn();
const mockStoreInvoke = jest.fn();
jest.mock('../../application/usecases/steps/common/publish_resume_use_case', () => ({
  PublishResultUseCase: jest.fn().mockImplementation(() => ({ invoke: mockPublishInvoke })),
}));
jest.mock('../../application/usecases/steps/common/store_configuration_use_case', () => ({
  StoreConfigurationUseCase: jest.fn().mockImplementation(() => ({ invoke: mockStoreInvoke })),
}));

const mockGetProjectDetail = jest.fn();
jest.mock('../../data/repository/project/project_board_query_repository', () => ({
  ProjectBoardQueryRepository: jest.fn().mockImplementation(() => ({
    getProjectDetail: mockGetProjectDetail,
  })),
}));

const projectCompositionSpy = jest.spyOn(projectBoardCompositionRoot, 'createProjectBoardCompositionRoot');
const executionBuilderSpy = jest.spyOn(executionBuilder, 'buildGithubActionExecution');
const agentProvisioningSpy = jest.spyOn(agentRuntime, 'prepareGithubAgentRuntime');
const finishActionSpy = jest.spyOn(actionCompletion, 'finishGithubAction');

describe('runGitHubAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'fake-token';
      return '';
    });
    mockGetProjectDetail.mockResolvedValue({ id: 'p1', title: 'Board', url: 'https://example.com' });
    mockMainRun.mockResolvedValue([]);
    mockPublishInvoke.mockResolvedValue([]);
    mockStoreInvoke.mockResolvedValue([]);
    mockWaitForPreviousWorkflowRuns.mockResolvedValue(undefined);
    mockExecutionAdmissionInvoke.mockResolvedValue({ decision: 'execute', tokenUser: 'token-user' });
  });

  it('builds Execution and calls mainRun', async () => {
    await runGitHubAction();

    expect(core.getInput).toHaveBeenCalledWith(INPUT_KEYS.TOKEN, { required: true });
    expect(mockMainRun).toHaveBeenCalledTimes(1);
    const execution = mockMainRun.mock.calls[0][0];
    expect(execution).toBeDefined();
    expect(execution.tokens).toBeDefined();
    expect(execution.ai).toBeDefined();
    expect(execution.singleAction).toBeDefined();
    expect(execution.owner).toBe('test-owner');
    expect(execution.repo).toBe('test-repo');
    expect(execution.actor).toBe('test-actor');
  });

  it('discards a normal PAT-triggered run before composing dependencies or entering the queue', async () => {
    mockExecutionAdmissionInvoke.mockResolvedValue({ decision: 'discard', tokenUser: 'test-actor' });

    await runGitHubAction();

    expect(mockExecutionAdmissionInvoke).toHaveBeenCalledWith({
      actor: 'test-actor',
      token: 'fake-token',
      isSingleAction: false,
      validSingleAction: false,
    });
    expect(projectCompositionSpy).not.toHaveBeenCalled();
    expect(executionBuilderSpy).not.toHaveBeenCalled();
    expect(agentProvisioningSpy).not.toHaveBeenCalled();
    expect(mockWaitForPreviousWorkflowRuns).not.toHaveBeenCalled();
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
    expect(mockGetProjectDetail).not.toHaveBeenCalled();
    expect(mockPublishInvoke).not.toHaveBeenCalled();
    expect(mockStoreInvoke).not.toHaveBeenCalled();
  });

  it('passes a valid single action through admission and the normal lifecycle', async () => {
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      if (key === INPUT_KEYS.SINGLE_ACTION) return ACTIONS.CREATE_TAG;
      if (key === INPUT_KEYS.SINGLE_ACTION_ISSUE) return '42';
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'fake-token';
      return '';
    });

    await runGitHubAction();

    expect(mockExecutionAdmissionInvoke).toHaveBeenCalledWith({
      actor: 'test-actor',
      token: 'fake-token',
      isSingleAction: true,
      validSingleAction: true,
    });
    expect(mockMainRun).toHaveBeenCalledTimes(1);
    expect(mockMainRun.mock.calls[0][0].tokenUser).toBe('token-user');
  });

  it('fails closed when PAT identity cannot be resolved', async () => {
    mockExecutionAdmissionInvoke.mockRejectedValue(new Error('identity lookup failed'));

    await expect(runGitHubAction()).rejects.toThrow('identity lookup failed');

    expect(projectCompositionSpy).not.toHaveBeenCalled();
    expect(executionBuilderSpy).not.toHaveBeenCalled();
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
  });

  it('admits a queue-gate-only run before project composition or execution construction', async () => {
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      if (key === INPUT_KEYS.QUEUE_GATE_ONLY) return 'true';
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'github-token';
      return '';
    });

    await runGitHubAction();

    expect(mockWaitForPreviousWorkflowRuns).toHaveBeenCalledWith(
      'github-token',
      { owner: 'test-owner', repo: 'test-repo' },
    );
    expect(mockExecutionAdmissionInvoke).not.toHaveBeenCalled();
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(projectCompositionSpy).not.toHaveBeenCalled();
    expect(executionBuilderSpy).not.toHaveBeenCalled();
    expect(agentProvisioningSpy).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
    expect(mockGetProjectDetail).not.toHaveBeenCalled();
    expect(mockPublishInvoke).not.toHaveBeenCalled();
    expect(mockStoreInvoke).not.toHaveBeenCalled();
  });

  it('fails a queue-gate-only run closed with the canonical sanitized error', async () => {
    mockWaitForPreviousWorkflowRuns.mockRejectedValue(new Error('provider response body and token should not escape'));
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      if (key === INPUT_KEYS.QUEUE_GATE_ONLY) return 'true';
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'github-token';
      return '';
    });

    await expect(runGitHubAction()).rejects.toThrow(
      'Workflow queue check failed; sequential execution was not bypassed.',
    );
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(projectCompositionSpy).not.toHaveBeenCalled();
    expect(executionBuilderSpy).not.toHaveBeenCalled();
    expect(agentProvisioningSpy).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
    expect(mockGetProjectDetail).not.toHaveBeenCalled();
    expect(mockPublishInvoke).not.toHaveBeenCalled();
    expect(mockStoreInvoke).not.toHaveBeenCalled();
  });


  it('calls finishWithResults (PublishResult and StoreConfiguration) after mainRun', async () => {
    await runGitHubAction();

    expect(mockPublishInvoke).toHaveBeenCalledTimes(1);
    expect(mockStoreInvoke).toHaveBeenCalledTimes(1);
  });

  it('uses INPUT_VARS_JSON when set for getInput', async () => {
    const inputVarsJson = JSON.stringify({
      INPUT_TOKEN: 'from-env-token',
      INPUT_DEBUG: 'true',
    });
    const orig = process.env.INPUT_VARS_JSON;
    process.env.INPUT_VARS_JSON = inputVarsJson;
    (core.getInput as jest.Mock).mockImplementation(() => '');

    await runGitHubAction();

    const execution = mockMainRun.mock.calls[0][0];
    expect(execution).toBeDefined();
    process.env.INPUT_VARS_JSON = orig;
  });
  it('calls setFailed when finishWithResults runs with single action throwError and results have errors', async () => {
    const { Result } = require('../../data/model/result');
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      if (key === INPUT_KEYS.SINGLE_ACTION) return ACTIONS.CREATE_RELEASE;
      if (key === INPUT_KEYS.SINGLE_ACTION_ISSUE) return '42';
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'fake-token';
      return '';
    });
    mockMainRun.mockResolvedValue([
      new Result({ id: 'a', success: false, executed: true, errors: ['First error'] }),
    ]);

    await runGitHubAction();

    expect(mockPublishInvoke).toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith('First error');
  });

  it('calls logError when INPUT_VARS_JSON is invalid JSON', async () => {
    const orig = process.env.INPUT_VARS_JSON;
    process.env.INPUT_VARS_JSON = 'not valid json';
    const { logError } = require('../../utils/logger');

    await runGitHubAction();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('INPUT_VARS_JSON'));
    process.env.INPUT_VARS_JSON = orig;
  });
});
