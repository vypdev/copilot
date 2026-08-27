import { InitialSetupUseCase } from '../initial_setup_use_case';
import { Result } from '../../../../data/model/result';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logDebugInfo: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '📋'),
}));

const mockEnsureGitHubDirs = jest.fn();
const mockCopySetupFiles = jest.fn();
const mockHasValidSetupToken = jest.fn();
jest.mock('../../../../utils/setup_files', () => ({
  ensureGitHubDirs: (...args: unknown[]) => mockEnsureGitHubDirs(...args),
  copySetupFiles: (...args: unknown[]) => mockCopySetupFiles(...args),
  hasValidSetupToken: (...args: unknown[]) => mockHasValidSetupToken(...args),
}));

const mockGetDefaultBranch = jest.fn();
const mockCreateTag = jest.fn();
jest.mock('../../../../data/repository/release/repository_default_branch_repository', () => ({
  RepositoryReleaseRepository: jest.fn().mockImplementation(() => ({
    getDefaultBranch: mockGetDefaultBranch,
    createTag: mockCreateTag,
  })),
}));

const mockGetUserFromToken = jest.fn();
jest.mock('../../../../data/repository/organization/authenticated_user_repository', () => ({
  AuthenticatedUserRepository: jest.fn().mockImplementation(() => ({
    getUserFromToken: mockGetUserFromToken,
  })),
}));

const mockGetLatestTag = jest.fn();

const mockEnsureInitialLabels = jest.fn();
const mockEnsureIssueTypes = jest.fn();
const mockSetupPrepare = jest.fn();
const mockSetupHasValidToken = jest.fn();

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
    mockSetupPrepare.mockClear();
    mockSetupHasValidToken.mockClear();
    useCase = new InitialSetupUseCase(
      { getUserFromToken: mockGetUserFromToken, getTokenUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels },
      { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag },
      { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
    );
    mockSetupPrepare.mockReturnValue({ copied: 2, skipped: 0 });
    mockSetupHasValidToken.mockReturnValue(true);
    mockGetUserFromToken.mockResolvedValue('test-user');
    mockEnsureInitialLabels.mockReset();
    mockEnsureInitialLabels.mockResolvedValue({
      configured: { created: 0, existing: 5, errors: [] },
      progress: { created: 0, existing: 21, errors: [] },
    });
    mockEnsureIssueTypes.mockReset();
    mockEnsureIssueTypes.mockResolvedValue({ success: true, created: 0, existing: 3, errors: [] });
    mockGetLatestTag.mockReset();
    mockGetLatestTag.mockResolvedValue('1.0.0');
    mockGetDefaultBranch.mockReset();
    mockGetDefaultBranch.mockResolvedValue('main');
    mockCreateTag.mockReset();
    mockCreateTag.mockResolvedValue('abc123');
  });

  it('prepares the setup workspace and validates its token through the port', async () => {
    const param = baseParam();
    await useCase.invoke(param);
    expect(mockSetupPrepare).toHaveBeenCalledTimes(1);
    expect(mockSetupHasValidToken).toHaveBeenCalledTimes(1);
  });

  it('returns failure and does not continue when hasValidSetupToken is false', async () => {
    mockSetupHasValidToken.mockReturnValue(false);
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
      expect(mockSetupHasValidToken).toHaveBeenCalledTimes(1);
    } finally {
      mockSetupHasValidToken.mockReturnValue(true);
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
    expect(mockEnsureInitialLabels).toHaveBeenCalledTimes(1);
    expect(mockEnsureInitialLabels).toHaveBeenCalledWith(
      'owner',
      'repo',
      param.labels,
      'token',
    );
    expect(results[0].steps?.some((s) => s.includes('Issue types'))).toBe(true);
  });

  it('creates default tag v1.0.0 when no version tags exist', async () => {
    mockGetLatestTag.mockResolvedValue(undefined);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Default version tag v1.0.0 created'))).toBe(true);
    expect(mockGetDefaultBranch).toHaveBeenCalledWith('owner', 'repo', 'token');
    expect(mockCreateTag).toHaveBeenCalledWith('owner', 'repo', 'main', 'v1.0.0', 'token');
  });

  it('does not create default tag when repository already has tags', async () => {
    mockGetLatestTag.mockResolvedValue('2.0.0');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Default version tag'))).toBe(false);
    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(mockGetDefaultBranch).not.toHaveBeenCalled();
  });

  it('reports error when no tags and getDefaultBranch fails', async () => {
    mockGetLatestTag.mockResolvedValue(undefined);
    mockGetDefaultBranch.mockResolvedValue(undefined);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('default branch'))).toBe(true);
    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(mockGetDefaultBranch).toHaveBeenCalled();
  });

  it('reports error when no tags and createTag fails', async () => {
    mockGetLatestTag.mockResolvedValue(undefined);
    mockCreateTag.mockResolvedValue(undefined);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Failed to create tag'))).toBe(true);
  });

  it('reports error when ensureDefaultVersion throws (e.g. getLatestTag fails)', async () => {
    mockGetLatestTag.mockRejectedValue(new Error('network error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Error ensuring default version'))).toBe(true);
    expect(mockGetDefaultBranch).not.toHaveBeenCalled();
  });

  it('returns failure when verifyGitHubAccess fails', async () => {
    mockGetUserFromToken.mockRejectedValue(new Error('Invalid token'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });

  it('continues and reports configured-label provisioning errors', async () => {
    mockEnsureInitialLabels.mockResolvedValue({
      configured: { created: 0, existing: 0, errors: ['Label error'] },
      progress: { created: 0, existing: 21, errors: [] },
    });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Label error');
  });

  it('continues and reports progress-label provisioning errors', async () => {
    mockEnsureInitialLabels.mockResolvedValue({
      configured: { created: 0, existing: 5, errors: [] },
      progress: { created: 0, existing: 0, errors: ['Progress error'] },
    });
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

  it('returns failure when initial label provisioning throws', async () => {
    mockEnsureInitialLabels.mockRejectedValue(new Error('initial labels failed'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('labels'))).toBe(true);
    expect(results[0].steps?.some((step) => step.includes('Labels checked'))).toBe(false);
    expect(results[0].steps?.some((step) => step.includes('Progress labels checked'))).toBe(false);
    expect(mockEnsureIssueTypes).toHaveBeenCalledTimes(1);
  });


  it('returns failure when ensureIssueTypes throws', async () => {
    mockEnsureIssueTypes.mockRejectedValue(new Error('issue types failed'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });

  it('returns failure in catch when an unexpected error is thrown', async () => {
    mockSetupPrepare.mockImplementation(() => {
      throw new Error('unexpected');
    });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('initial setup'))).toBe(true);
  });
});
