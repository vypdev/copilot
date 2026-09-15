/**
 * Unit tests for runLocalAction.
 * Mocks getActionInputsWithDefaults, the project-board adapter, mainRun, chalk, boxen.
 */

jest.mock('chalk', () => ({
  cyan: (s: string) => s,
  gray: (s: string) => s,
  red: (s: string) => s,
  default: { cyan: (s: string) => s, gray: (s: string) => s, red: (s: string) => s },
}));
jest.mock('boxen', () => jest.fn((text: string) => text));

jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
}));

const mockGetActionInputsWithDefaults = jest.fn();
jest.mock('../../utils/yml_utils', () => ({
  getActionInputsWithDefaults: () => mockGetActionInputsWithDefaults(),
}));

const mockMainRun = jest.fn();
jest.mock('../common_action', () => ({
  mainRun: (...args: unknown[]) => mockMainRun(...args),
}));

const mockGetProjectDetail = jest.fn();
jest.mock('../../data/repository/project/project_board_query_repository', () => ({
  ProjectBoardQueryRepository: jest.fn().mockImplementation(() => ({
    getProjectDetail: mockGetProjectDetail,
  })),
}));

import { runLocalAction } from '../local_action';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { ApplicationError } from '../../application/errors/application_error';

/** Minimal defaults so local_action can run (avoids .split on undefined). */
function minimalActionInputs(): Record<string, string> {
  const keys = Object.values(INPUT_KEYS) as string[];
  return Object.fromEntries(keys.map((k) => [k, '']));
}

describe('runLocalAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActionInputsWithDefaults.mockReturnValue(minimalActionInputs());
    mockGetProjectDetail.mockResolvedValue({ id: 'p1', title: 'Board', url: 'https://example.com' });
    mockMainRun.mockResolvedValue([]);
  });

  it('builds Execution from additionalParams and actionInputs and calls mainRun', async () => {
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 'local-token',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    expect(mockMainRun).toHaveBeenCalledTimes(1);
    const execution = mockMainRun.mock.calls[0][0];
    expect(execution).toBeDefined();
    expect(execution.tokens).toBeDefined();
    expect(execution.ai).toBeDefined();
    expect(execution.welcome).toBeDefined();
  });

  it('uses additionalParams over actionInputs defaults', async () => {
    mockGetActionInputsWithDefaults.mockReturnValue({
      ...minimalActionInputs(),
      [INPUT_KEYS.DEBUG]: 'false',
      [INPUT_KEYS.TOKEN]: 'default-token',
    });
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 'override-token',
      [INPUT_KEYS.DEBUG]: 'true',
      repo: { owner: 'x', repo: 'y' },
      eventName: 'push',
      commits: { ref: 'refs/heads/develop' },
    };

    await runLocalAction(params);

    const execution = mockMainRun.mock.calls[0][0];
    expect(execution.tokens.token).toBe('override-token');
    expect(execution.debug).toBe(true);
  });

  it('maps local issue-comment publication inputs into the single-action model', async () => {
    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 'local-token',
      [INPUT_KEYS.SINGLE_ACTION]: 'publish_issue_comment',
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '42',
      [INPUT_KEYS.SINGLE_ACTION_MESSAGE]: 'Deployment failed.',
      [INPUT_KEYS.SINGLE_ACTION_COMMENT_ID]: '101',
      [INPUT_KEYS.SINGLE_ACTION_COMMENT_MODE]: 'append',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'workflow_dispatch',
    });

    expect(mockMainRun.mock.calls[0][0].singleAction).toMatchObject({
      issue: 42,
      message: 'Deployment failed.',
      commentId: 101,
      commentMode: 'append',
    });
  });

  it('renders a semantic aggregate and keeps internal steps and reminder prose out of the terminal', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([
      { success: true, executed: true, steps: ['Step 1'], errors: [], reminders: [] },
      { success: true, executed: true, steps: [], errors: [], reminders: ['Reminder 1'] },
    ]);
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    expect(boxen).toHaveBeenCalled();
    const content = boxen.mock.calls[0][0] as string;
    expect(content).toContain('Outcome:');
    expect(content).toContain('Status: Succeeded');
    expect(content).toContain('Completed operations: 2');
    expect(content).toContain('Operator reminders recorded: 1');
    expect(content).not.toContain('Step 1');
    expect(content).not.toContain('Reminder 1');
  });

  it('renders a semantic Think response as an answer instead of generic steps', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([{
      success: true,
      executed: true,
      steps: [],
      errors: [],
      reminders: [],
      payload: { publication: { kind: 'direct-answer', answer: 'Use the repository locale setting.' } },
    }]);

    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.SINGLE_ACTION]: 'think',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'issue',
      issue: { number: 1 },
      comment: { body: '/copilot explain locale' },
    });

    const content = boxen.mock.calls[0][0];
    expect(content).toContain('Answer:');
    expect(content).toContain('Use the repository locale setting.');
    expect(content).not.toContain('Steps:');
  });

  it('uses the configured repository locale for local result labels', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([{
      success: true,
      executed: true,
      steps: [],
      errors: [],
      reminders: [],
      payload: { publication: { kind: 'direct-answer', answer: 'Usa el locale del repositorio.' } },
    }]);

    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.SINGLE_ACTION]: 'think_action',
      [INPUT_KEYS.REPOSITORY_LOCALE]: 'es-ES',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'issue_comment',
      issue: {},
      comment: { body: '/copilot explain locale' },
    });

    expect(boxen.mock.calls[0][0]).toContain('Respuesta:');
    expect(boxen.mock.calls[0][0]).not.toContain('Answer:');
  });

  it('renders aggregate success and skip state wholly in the configured repository locale', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([
      { success: true, executed: true, steps: ['Internal English step'], errors: [], reminders: [] },
      { success: true, executed: false, steps: [], errors: [], reminders: [] },
    ]);

    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.REPOSITORY_LOCALE]: 'es-ES',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    });

    const content = boxen.mock.calls[0][0] as string;
    expect(content).toContain('Resultado:');
    expect(content).toContain('Estado: Completado');
    expect(content).toContain('Operaciones completadas: 1');
    expect(content).toContain('Operaciones omitidas: 1');
    expect(content).not.toContain('Internal English step');
    expect(content).not.toContain('Outcome:');
  });

  it('renders an empty result set as an explicit no-change outcome', async () => {
    const boxen = require('boxen');

    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 't',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    });

    expect(boxen.mock.calls[0][0]).toContain('Status: No changes');
  });

  it('calls getProjectDetail for each project id when PROJECT_IDS is set', async () => {
    mockGetProjectDetail
      .mockResolvedValueOnce({ id: 'proj-1', title: 'P1', url: 'https://x.com/1' })
      .mockResolvedValueOnce({ id: 'proj-2', title: 'P2', url: 'https://x.com/2' });
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.PROJECT_IDS]: 'proj-1, proj-2',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    expect(mockGetProjectDetail).toHaveBeenCalledTimes(2);
    expect(mockGetProjectDetail).toHaveBeenCalledWith('proj-1', 'o', 't');
    expect(mockGetProjectDetail).toHaveBeenCalledWith('proj-2', 'o', 't');
  });

  it('fails before composing dependencies when repository context is missing', async () => {
    await expect(runLocalAction({ [INPUT_KEYS.TOKEN]: 't' }))
      .rejects.toThrow('Repository context requires a non-empty owner and repository.');

    expect(mockMainRun).not.toHaveBeenCalled();
    expect(mockGetProjectDetail).not.toHaveBeenCalled();
  });

  it.each([
    'create_tag',
    'create_release',
    'publish_github_action',
    'prepare_deployment_action',
    'continue_deployment_action',
    'published_deployment_action',
    'failed_deployment_action',
  ])('rejects local deployment mutation %s before composition', async (singleAction) => {
    await expect(runLocalAction({
      [INPUT_KEYS.SINGLE_ACTION]: singleAction,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '355',
      [INPUT_KEYS.TOKEN]: 'local-token',
      repo: { owner: 'o', repo: 'r' },
    })).rejects.toThrow('serialized GitHub workflows');

    expect(mockMainRun).not.toHaveBeenCalled();
    expect(mockGetProjectDetail).not.toHaveBeenCalled();
  });

  it('expands semantic errors and summarizes reminder evidence without replaying its prose', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([
      { success: false, executed: false, steps: [], errors: [new ApplicationError('provider.unavailable', 'Provider detail.')], reminders: [] },
      { success: true, executed: true, steps: [], errors: [], reminders: ['Reminder text'] },
    ]);
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    const content = boxen.mock.calls[0][0];
    expect(content).toContain('Error code: provider.unavailable');
    expect(content).not.toContain('Provider detail.');
    expect(content).toContain('Status: Partially completed');
    expect(content).toContain('Operator reminders recorded: 1');
    expect(content).not.toContain('Reminder text');
  });

  it('renders errors even when the failed operation was executed', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([
      { success: false, executed: true, steps: ['Attempted operation'], errors: [new ApplicationError('workflow.failed', 'Executed operation failed.')], reminders: [] },
    ]);
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    expect(boxen.mock.calls[0][0]).toContain('Error code: workflow.failed');
    expect(boxen.mock.calls[0][0]).not.toContain('Executed operation failed.');
  });

  it('renders one complete error view in the configured repository locale', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([{
      success: false,
      executed: true,
      steps: [],
      errors: [new ApplicationError('provider.rate-limited', 'English provider message.')],
      reminders: [],
    }]);

    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.REPOSITORY_LOCALE]: 'es-MX',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    });

    const content = boxen.mock.calls[0][0] as string;
    expect(content).toContain('Errores:');
    expect(content).toContain('Impacto: El proveedor limitó temporalmente la operación.');
    expect(content).toContain('Código de error: provider.rate-limited');
    expect(content).toContain('Acción: Reinténtalo cuando se restablezca el límite del proveedor.');
    expect(content).toContain('Reintentable: Sí');
    expect(content).not.toContain('English provider message.');
    expect(content).not.toContain('Impact:');
  });

  it('renders validated partial-state recovery without losing its safe identifier', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([{
      success: false,
      executed: true,
      steps: [],
      errors: [new ApplicationError('provider.unavailable', 'Producer message.', {
        recovery: {
          id: 'inactivity-explanation-failed',
          variables: { issueNumber: 42 },
        },
      })],
      reminders: [],
    }]);

    await runLocalAction({
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.REPOSITORY_LOCALE]: 'es-ES',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    });

    const content = boxen.mock.calls[0][0] as string;
    expect(content).toContain('Impacto: La issue #42 se cerró sin su explicación final');
    expect(content).toContain('Estado conservado: La issue #42 permanece cerrada');
    expect(content).not.toContain('Producer message.');
    expect(content).not.toContain('El proveedor no estaba disponible');
  });

  it('uses custom image URLs when provided so default image arrays are not pushed', async () => {
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      [INPUT_KEYS.IMAGES_ISSUE_AUTOMATIC]: 'https://custom-auto.example.com',
      [INPUT_KEYS.IMAGES_ISSUE_FEATURE]: 'https://custom-feature.example.com',
      [INPUT_KEYS.IMAGES_ISSUE_BUGFIX]: 'https://custom-bugfix.example.com',
      [INPUT_KEYS.IMAGES_ISSUE_DOCS]: 'https://custom-docs.example.com',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    const execution = mockMainRun.mock.calls[0][0];
    expect(execution.images).toBeDefined();
    expect(execution.images.issueAutomaticActions).toContain('https://custom-auto.example.com');
    expect(execution.images.issueFeatureGifs).toContain('https://custom-feature.example.com');
    expect(execution.images.issueBugfixGifs).toContain('https://custom-bugfix.example.com');
    expect(execution.images.issueDocsGifs).toContain('https://custom-docs.example.com');
  });

  it('uses actionInputs when additionalParams omit token and opencode url', async () => {
    mockGetActionInputsWithDefaults.mockReturnValue({
      ...minimalActionInputs(),
      [INPUT_KEYS.TOKEN]: 'from-action-inputs',
          });
    const params: Record<string, unknown> = {
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    const execution = mockMainRun.mock.calls[0][0];
    expect(execution.tokens.token).toBe('from-action-inputs');
  });
});
