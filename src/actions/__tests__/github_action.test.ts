/**
 * Unit tests for runGitHubAction.
 * Mocks @actions/core, the project-board adapter, mainRun, and finish flow.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as projectBoardCompositionRoot from '../../infrastructure/composition/project_board_composition_root';
import * as executionBuilder from '../github_action_execution';
import * as agentRuntime from '../github_action_runtime';
import * as actionCompletion from '../github_action_completion';
import { runGitHubAction, runGitHubActionEntry } from '../github_action';
import { ACTIONS } from '../../data/model/action_types';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { ApplicationError } from '../../application/errors/application_error';

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
  setOutput: jest.fn(),
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

const mockIsActorAllowedToModifyFiles = jest.fn();
jest.mock('../../infrastructure/composition/actor_authorization_composition_root', () => ({
  createActorAuthorizationRepository: jest.fn().mockImplementation(() => ({
    isActorAllowedToModifyFiles: mockIsActorAllowedToModifyFiles,
  })),
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
  ...jest.requireActual('../../application/usecases/steps/common/store_configuration_use_case'),
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
    mockPublishInvoke.mockResolvedValue(undefined);
    mockStoreInvoke.mockResolvedValue([]);
    mockExecutionAdmissionInvoke.mockResolvedValue({ decision: 'execute', tokenUser: 'token-user' });
    mockIsActorAllowedToModifyFiles.mockResolvedValue(true);
    github.context.eventName = 'workflow_dispatch';
    github.context.payload = {};
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
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
    expect(mockGetProjectDetail).not.toHaveBeenCalled();
    expect(mockPublishInvoke).not.toHaveBeenCalled();
    expect(mockStoreInvoke).not.toHaveBeenCalled();
  });

  it('discards an unaddressed comment before project, AI, runtime, or result work', async () => {
    github.context.eventName = 'issue_comment';
    github.context.payload = {
      action: 'created',
      issue: { number: 42 },
      comment: { id: 101, body: 'Automated coverage report' },
    };

    await runGitHubAction();

    expect(mockExecutionAdmissionInvoke).toHaveBeenCalledTimes(1);
    expect(projectCompositionSpy).not.toHaveBeenCalled();
    expect(executionBuilderSpy).not.toHaveBeenCalled();
    expect(agentProvisioningSpy).not.toHaveBeenCalled();
    expect(mockIsActorAllowedToModifyFiles).not.toHaveBeenCalled();
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
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

  it('maps issue-comment publication inputs into the single-action model', async () => {
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      const values: Record<string, string> = {
        [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.PUBLISH_ISSUE_COMMENT,
        [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '42',
        [INPUT_KEYS.SINGLE_ACTION_MESSAGE]: 'Deployment failed.',
        [INPUT_KEYS.SINGLE_ACTION_COMMENT_ID]: '101',
        [INPUT_KEYS.SINGLE_ACTION_COMMENT_MODE]: 'append',
      };
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'fake-token';
      return values[key] ?? '';
    });

    await runGitHubAction();

    expect(mockMainRun.mock.calls[0][0].singleAction).toMatchObject({
      currentSingleAction: ACTIONS.PUBLISH_ISSUE_COMMENT,
      issue: 42,
      message: 'Deployment failed.',
      commentId: 101,
      commentMode: 'append',
    });
  });

  it('does not prepare an agent runtime for an unauthorized members-only event', async () => {
    github.context.eventName = 'issues';
    github.context.payload = { action: 'opened', issue: { number: 42 } };
    (core.getInput as jest.Mock).mockImplementation((key: string, opts?: { required?: boolean }) => {
      if (key === INPUT_KEYS.AI_MEMBERS_ONLY) return 'true';
      if (opts?.required && key === INPUT_KEYS.TOKEN) return 'fake-token';
      return '';
    });
    mockIsActorAllowedToModifyFiles.mockResolvedValue(false);

    await runGitHubAction();

    expect(mockIsActorAllowedToModifyFiles).toHaveBeenCalledWith(
      'test-owner',
      'test-repo',
      'test-actor',
      'fake-token',
    );
    expect(agentProvisioningSpy).not.toHaveBeenCalled();
    expect(mockMainRun).toHaveBeenCalledTimes(1);
    expect(mockMainRun.mock.calls[0][0].ai.getAgentConfiguration('planner')).toEqual(expect.objectContaining({
      model: '',
    }));
    expect(mockMainRun.mock.calls[0][0].ai.getAgentConfiguration('planner')).not.toHaveProperty('command');
  });

  it('fails closed when PAT identity cannot be resolved', async () => {
    mockExecutionAdmissionInvoke.mockRejectedValue(new Error('identity lookup failed'));

    await expect(runGitHubAction()).rejects.toThrow('identity lookup failed');

    expect(projectCompositionSpy).not.toHaveBeenCalled();
    expect(executionBuilderSpy).not.toHaveBeenCalled();
    expect(mockMainRun).not.toHaveBeenCalled();
    expect(finishActionSpy).not.toHaveBeenCalled();
  });

  it('publishes results but skips configuration persistence when no issue target exists', async () => {
    await runGitHubAction();

    expect(mockPublishInvoke).toHaveBeenCalledTimes(1);
    expect(mockStoreInvoke).not.toHaveBeenCalled();
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
      new Result({ id: 'a', success: false, executed: true, errors: [new ApplicationError('workflow.failed', 'First error')] }),
    ]);

    await runGitHubAction();

    expect(mockPublishInvoke).toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Cause (workflow.failed): First error'));
  });

  it('calls logError when INPUT_VARS_JSON is invalid JSON', async () => {
    const orig = process.env.INPUT_VARS_JSON;
    process.env.INPUT_VARS_JSON = 'not valid json';
    const { logError } = require('../../utils/logger');

    await runGitHubAction();

    expect(logError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'configuration.invalid',
      message: expect.stringContaining('INPUT_VARS_JSON'),
    }));
    process.env.INPUT_VARS_JSON = orig;
  });
});

describe('runGitHubActionEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets Node preserve an existing failure exit code after a resolved run', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 1;
    const run = jest.fn().mockResolvedValue(undefined);

    try {
      await runGitHubActionEntry(run);

      expect(run).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      expect(core.setFailed).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('converts an unhandled rejection into an action failure without forcing process exit', async () => {
    await runGitHubActionEntry(jest.fn().mockRejectedValue(new Error('entry failed')));

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Cause (workflow.failed): GitHub Action execution failed.'));
    expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('entry failed'));
  });
});
