import { InitialSetupUseCase } from '../initial_setup_use_case';
import { Result } from '../../../data/model/result';
import type { Execution } from '../../../data/model/execution';

jest.mock('../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '📋'),
}));

const mockEnsureGitHubDirs = jest.fn();
const mockCopySetupFiles = jest.fn();
const mockHasValidSetupToken = jest.fn();
jest.mock('../../../utils/setup_files', () => ({
  ensureGitHubDirs: (...args: unknown[]) => mockEnsureGitHubDirs(...args),
  copySetupFiles: (...args: unknown[]) => mockCopySetupFiles(...args),
  hasValidSetupToken: (...args: unknown[]) => mockHasValidSetupToken(...args),
}));

const mockGetUserFromToken = jest.fn();
jest.mock('../../../data/repository/project_repository', () => ({
  ProjectRepository: jest.fn().mockImplementation(() => ({
    getUserFromToken: mockGetUserFromToken,
  })),
}));

const mockEnsureLabels = jest.fn();
const mockEnsureProgressLabels = jest.fn();
const mockEnsureIssueTypes = jest.fn();
jest.mock('../../../data/repository/issue_repository', () => ({
  IssueRepository: jest.fn().mockImplementation(() => ({
    ensureLabels: mockEnsureLabels,
    ensureProgressLabels: mockEnsureProgressLabels,
    ensureIssueTypes: mockEnsureIssueTypes,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    tokens: { token: 'token' },
    labels: {},
    issueTypes: {},
    singleAction: {},
    currentConfiguration: {},
    branches: {},
    release: {},
    hotfix: {},
    issue: {},
    pullRequest: {},
    workflows: {},
    project: { getProjects: () => [], getProjectColumnIssueCreated: () => '', getProjectColumnIssueInProgress: () => '' },
    commit: {},
    commitPrefixBuilder: '',
    emoji: {},
    images: {},
    ai: {},
    locale: {},
    sizeThresholds: {},
    ...overrides,
  } as unknown as Execution;
}

describe('InitialSetupUseCase', () => {
  let useCase: InitialSetupUseCase;

  beforeEach(() => {
    useCase = new InitialSetupUseCase();
    mockEnsureGitHubDirs.mockClear();
    mockCopySetupFiles.mockReturnValue({ copied: 2, skipped: 0 });
    mockHasValidSetupToken.mockReturnValue(true);
    mockGetUserFromToken.mockResolvedValue('test-user');
    mockEnsureLabels.mockResolvedValue({ success: true, created: 0, existing: 5, errors: [] });
    mockEnsureProgressLabels.mockResolvedValue({ created: 0, existing: 21, errors: [] });
    mockEnsureIssueTypes.mockResolvedValue({ success: true, created: 0, existing: 3, errors: [] });
  });

  it('calls ensureGitHubDirs, copySetupFiles and hasValidSetupToken with process.cwd()', async () => {
    const param = baseParam();
    await useCase.invoke(param);
    expect(mockEnsureGitHubDirs).toHaveBeenCalledWith(process.cwd());
    expect(mockCopySetupFiles).toHaveBeenCalledWith(process.cwd());
    expect(mockHasValidSetupToken).toHaveBeenCalledWith(process.cwd());
  });

  it('returns failure and does not continue when hasValidSetupToken is false', async () => {
    mockHasValidSetupToken.mockReturnValue(false);
    try {
      const param = baseParam();
      const results = await useCase.invoke(param);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].errors).toContain(
        'PERSONAL_ACCESS_TOKEN must be set (environment or .env) with a valid token to run setup.'
      );
      expect(results[0].steps).not.toContainEqual(
        expect.stringMatching(/GitHub access verified/)
      );
      expect(mockHasValidSetupToken).toHaveBeenCalledWith(process.cwd());
    } finally {
      mockHasValidSetupToken.mockReturnValue(true);
    }
  });

  it('returns success and steps including setup files when all steps succeed', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(Result);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Setup files'))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('GitHub access verified'))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Labels checked'))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Progress labels'))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Issue types'))).toBe(true);
  });

  it('returns failure when verifyGitHubAccess fails', async () => {
    mockGetUserFromToken.mockRejectedValue(new Error('Invalid token'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });

  it('continues and reports errors when ensureLabels fails', async () => {
    mockEnsureLabels.mockResolvedValue({ success: false, created: 0, existing: 0, errors: ['Label error'] });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Label error');
  });

  it('continues and reports errors when ensureProgressLabels has errors', async () => {
    mockEnsureProgressLabels.mockResolvedValue({ created: 0, existing: 0, errors: ['Progress error'] });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Progress error');
  });

  it('continues and reports errors when ensureIssueTypes returns success false', async () => {
    mockEnsureIssueTypes.mockResolvedValue({ success: false, created: 0, existing: 0, errors: ['Issue type error'] });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Issue type error');
  });

  it('returns failure with errors when ensureLabels throws', async () => {
    mockEnsureLabels.mockRejectedValue(new Error('ensureLabels failed'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('labels'))).toBe(true);
  });

  it('returns failure when ensureProgressLabels throws', async () => {
    mockEnsureProgressLabels.mockRejectedValue(new Error('progress labels failed'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });

  it('returns failure when ensureIssueTypes throws', async () => {
    mockEnsureIssueTypes.mockRejectedValue(new Error('issue types failed'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });

  it('returns failure in catch when an unexpected error is thrown', async () => {
    mockEnsureGitHubDirs.mockImplementation(() => {
      throw new Error('unexpected');
    });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('setup inicial'))).toBe(true);
  });
});
