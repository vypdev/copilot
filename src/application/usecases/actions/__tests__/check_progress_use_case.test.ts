/**
 * Integration-style tests for CheckProgressUseCase with the OpenCode-based flow.
 * Covers edge cases: missing AI config, no issue/branch/description, AI returns undefined/invalid
 * progress, progress 0% (single call; HTTP retries are in the findings adapter), success path with label updates.
 */

import { CheckProgressUseCase } from '../check_progress_use_case';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const mockGetDescription = jest.fn();
const mockSetProgressLabel = jest.fn();
const mockGetLabels = jest.fn();
const mockSetLabels = jest.fn();

const mockGetListOfBranches = jest.fn();

const mockGetOpenPullRequestNumbersByHeadBranch = jest.fn();


const mockAskAgent = jest.fn();
function baseParam(overrides: Record<string, unknown> = {}): Execution {
  const branches = {
    main: 'main',
    development: 'develop',
    featureTree: 'feature',
    bugfixTree: 'bugfix',
    hotfixTree: 'hotfix',
    releaseTree: 'release',
    docsTree: 'docs',
    choreTree: 'chore',
  };
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 123,
    tokens: { token: 'token' },
    ai: new Ai('http://localhost:4096', 'opencode/kimi-k2.5', false, false, [], false, 'low', 20),
    commit: { branch: 'feature/123-add-feature' },
    branches,
    ...overrides,
  } as unknown as Execution;
}

describe('CheckProgressUseCase', () => {
  let useCase: CheckProgressUseCase;

  beforeEach(() => {
    useCase = new CheckProgressUseCase(
      { getDescription: mockGetDescription, setProgressLabel: mockSetProgressLabel, getLabels: mockGetLabels, setLabels: mockSetLabels },
      { getListOfBranches: mockGetListOfBranches },
      { getOpenPullRequestNumbersByHeadBranch: mockGetOpenPullRequestNumbersByHeadBranch },
      { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) },
    );
    mockGetDescription.mockReset();
    mockSetProgressLabel.mockReset();
    mockGetLabels.mockReset();
    mockSetLabels.mockReset();
    mockGetListOfBranches.mockReset();
    mockGetOpenPullRequestNumbersByHeadBranch.mockReset();
    mockAskAgent.mockReset();
  });

  it('returns error when AI config is missing (no server URL)', async () => {
    const param = baseParam({
      ai: new Ai('', 'opencode/model', false, false, [], false, 'low', 20),
    });
    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Could not retrieve issue description for issue #123'
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when AI config is missing (no model)', async () => {
    const param = baseParam({
      ai: new Ai('http://localhost:4096', '', false, false, [], false, 'low', 20),
    });
    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Missing required agent configuration. Provide a model and a valid CLI command.'
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when issue number is -1', async () => {
    const param = baseParam({ issueNumber: -1 });
    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Issue number not found. Cannot check progress without an issue number.'
    );
    expect(mockGetDescription).not.toHaveBeenCalled();
  });

  it('returns error when issue description could not be retrieved', async () => {
    mockGetDescription.mockResolvedValue(null);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Could not retrieve issue description for issue #123'
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when no branch is found (no commit.branch and no matching branch in list)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockGetListOfBranches.mockResolvedValue(['main', 'develop', 'other/456-foo']);
    const param = baseParam({ commit: { branch: undefined as unknown as string } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Could not find branch'))).toBe(true);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('finds branch from list when commit.branch is not set', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockGetListOfBranches.mockResolvedValue(['feature/123-add-feature', 'main', 'develop']);
    mockAskAgent.mockResolvedValue({
      progress: 60,
      summary: 'More than half done',
      remaining: 'Tests',
    });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);
    const param = baseParam({ commit: { branch: undefined as unknown as string } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].payload).toMatchObject({ progress: 60, branch: 'feature/123-add-feature' });
    expect(mockAskAgent).toHaveBeenCalled();
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('123');
    expect(prompt).toContain('develop');
    expect(prompt).toContain('feature/123-add-feature');
    expect(prompt).toContain('Issue body');
  });

  it('returns error result when askAgent returns undefined (OpenCode failure)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue(undefined);

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Progress detection returned 0%'))).toBe(true);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
  });

  it('returns error when progress is 0% (single call; HTTP retries are in the findings adapter)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 0, summary: 'No progress yet' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].payload).toMatchObject({ progress: 0 });
    expect(results[0].errors?.some((e) => String(e).includes('Progress detection returned 0%'))).toBe(true);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('treats negative progress as 0% and returns failure (no label set)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: -10, summary: 'Invalid' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].payload).toMatchObject({ progress: 0 });
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('clamps progress to 100 when AI returns over 100', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 150, summary: 'Over' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(true);
    expect(results[0].payload).toMatchObject({ progress: 100 });
    expect(mockSetProgressLabel).toHaveBeenCalledWith(
      'owner',
      'repo',
      123,
      100,
      'token'
    );
  });

  it('success path: sets progress label on issue and on open PRs', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({
      progress: 75,
      summary: 'Almost there',
      remaining: 'Final tests',
    });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99]);
    mockGetLabels.mockResolvedValue(['feature', '50%']);

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps).toContain('Progress updated to: 75%');
    expect(mockSetProgressLabel).toHaveBeenCalledWith('owner', 'repo', 123, 75, 'token');
    expect(mockGetLabels).toHaveBeenCalledWith('owner', 'repo', 99, 'token');
    expect(mockSetLabels).toHaveBeenCalledWith(
      'owner',
      'repo',
      99,
      expect.arrayContaining(['feature', '75%']),
      'token'
    );
  });

  it('uses default summary when AI response has no summary', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 30 });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(true);
    expect(results[0].payload).toMatchObject({
      progress: 30,
      summary: 'Unable to determine progress.',
    });
  });
});
