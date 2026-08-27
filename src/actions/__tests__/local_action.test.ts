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
import { INPUT_KEYS } from '../../utils/constants';

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

  it('logs steps and reminders via boxen after mainRun', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([
      { executed: true, steps: ['Step 1'], errors: [], reminders: [] },
      { executed: true, steps: [], errors: [], reminders: ['Reminder 1'] },
    ]);
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    expect(boxen).toHaveBeenCalled();
    expect(boxen.mock.calls[0][0]).toContain('Step 1');
    expect(boxen.mock.calls[0][0]).toContain('Reminder 1');
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
    expect(mockGetProjectDetail).toHaveBeenCalledWith('proj-1', 't');
    expect(mockGetProjectDetail).toHaveBeenCalledWith('proj-2', 't');
  });

  it('includes errors and reminders in boxen content when results have errors and reminders', async () => {
    const boxen = require('boxen');
    mockMainRun.mockResolvedValue([
      { executed: false, steps: [], errors: ['Error one'], reminders: [] },
      { executed: true, steps: [], errors: [], reminders: ['Reminder text'] },
    ]);
    const params: Record<string, unknown> = {
      [INPUT_KEYS.TOKEN]: 't',
      repo: { owner: 'o', repo: 'r' },
      eventName: 'push',
      commits: { ref: 'refs/heads/main' },
    };

    await runLocalAction(params);

    const content = boxen.mock.calls[0][0];
    expect(content).toContain('Error one');
    expect(content).toContain('Reminder text');
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
