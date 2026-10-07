import { InitialSetupUseCase } from '../initial_setup_use_case';
import { Result, getResultPayload } from '../../../../data/model/result';
import type { Execution } from '../../../../data/model/execution';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import { projectInitialSetupContext } from '../../push_single_action_contexts';

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
const mockSetupVariablesUpsert = jest.fn();
const repositorySnapshot = {
  ownerType: 'User' as const, repositoryVisibility: 'private' as const,
  repositorySecrets: [], repositorySecretsAccess: 'available' as const,
  organizationSecrets: [], repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
  organizationVariables: [], organizationAccess: 'not_applicable' as const,
  organizationSecretsAccess: 'not_applicable' as const, organizationVariablesAccess: 'not_applicable' as const,
};

function baseParam(overrides: Record<string, unknown> = {}) {
  const source = {
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
    ai: {},
    locale: {},
    sizeThresholds: {},
    inputs: {},
    ...overrides,
  } as unknown as Execution;
  return projectInitialSetupContext(source);
}

describe('InitialSetupUseCase', () => {
  let useCase: InitialSetupUseCase;

  beforeEach(() => {
    mockSetupPrepare.mockClear();
    mockSetupHasValidToken.mockClear();
    useCase = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels },
      { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag },
      { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
      { upsert: mockSetupVariablesUpsert },
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
    mockSetupVariablesUpsert.mockReset();
    mockSetupVariablesUpsert.mockResolvedValue({ created: 1, updated: 2, errors: [] });
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
      expect(results[0].errors.map((error) => error.message)).toContain(
        'A valid setup PAT must be provided to run setup. It is separate from the workflow PAT Secret.'
      );
      expect(results[0].steps).not.toContainEqual(
        expect.stringMatching(/GitHub access verified/)
      );
      expect(mockSetupHasValidToken).toHaveBeenCalledTimes(1);
      expect(mockSetupPrepare).not.toHaveBeenCalled();
      expect(getResultPayload(getResultPayload(results[0].payload)?.setupReceipt)?.effects)
        .toEqual(expect.arrayContaining([{ id: 'files', state: 'not-started', scope: 'local' }]));
    } finally {
      mockSetupHasValidToken.mockReturnValue(true);
    }
  });

  it('does not copy local files when GitHub identity verification fails', async () => {
    mockGetUserFromToken.mockRejectedValueOnce(new Error('provider detail'));

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(mockSetupPrepare).not.toHaveBeenCalled();
    expect(mockEnsureInitialLabels).not.toHaveBeenCalled();
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
      param.labels,
    );
    expect(results[0].steps?.some((s) => s.includes('Issue types'))).toBe(true);
    expect(getResultPayload(getResultPayload(results[0].payload)?.setupReceipt)?.effects).toEqual([
      { id: 'files', state: 'completed', scope: 'local' },
      { id: 'secrets', state: 'skipped', scope: 'repository' },
      { id: 'labels', state: 'skipped', scope: 'repository' },
      { id: 'issue-types', state: 'skipped', scope: 'repository' },
      { id: 'variables', state: 'skipped', scope: 'repository' },
      { id: 'initial-tag', state: 'skipped', scope: 'repository' },
    ]);
  });

  it('distinguishes skipped files from newly created labels and issue types in the receipt', async () => {
    mockSetupPrepare.mockReturnValueOnce({ copied: 0, skipped: 2 });
    mockEnsureInitialLabels.mockResolvedValueOnce({
      configured: { created: 1, existing: 4, errors: [] }, progress: { created: 0, existing: 21, errors: [] },
    });
    mockEnsureIssueTypes.mockResolvedValueOnce({ success: true, created: 2, existing: 1, errors: [] });
    const result = await useCase.invoke(baseParam());
    const effects = getResultPayload(getResultPayload(result[0].payload)?.setupReceipt)?.effects;
    expect(effects).toEqual(expect.arrayContaining([
      { id: 'files', state: 'skipped', scope: 'local' },
      { id: 'labels', state: 'completed', scope: 'repository' },
      { id: 'issue-types', state: 'completed', scope: 'repository' },
    ]));
  });

  it('reports provisioned Secrets and keeps a failed Secret write marked for inspection', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    const secretPort = { upsertSecrets: jest.fn().mockResolvedValueOnce({ created: 1, updated: 0, skipped: 0, errors: [] })
      .mockResolvedValueOnce({ created: 0, updated: 0, skipped: 0, errors: ['Secret write denied'] }) };
    const withSecrets = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels }, { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag }, { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
      { upsert: mockSetupVariablesUpsert }, secretPort,
    );
    const param = baseParam({ inputs: { setupConfiguration, setupRemoteConfiguration: repositorySnapshot,
      setupCredentials: { workflowPat: { name: 'PAT', value: 'fake-workflow-token' }, apiKeys: [] } } });
    const completed = await withSecrets.invoke(param);
    expect(getResultPayload(getResultPayload(completed[0].payload)?.setupReceipt)?.effects)
      .toContainEqual({ id: 'secrets', state: 'completed', scope: 'repository' });
    const failed = await withSecrets.invoke(param);
    expect(failed[0].success).toBe(false);
    expect(getResultPayload(getResultPayload(failed[0].payload)?.setupReceipt)?.effects)
      .toContainEqual({ id: 'secrets', state: 'needs-inspection', scope: 'repository' });
    expect(secretPort.upsertSecrets).toHaveBeenCalledTimes(2);
  });

  it('marks Secrets and Variables skipped when providers report no created or updated values', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    mockSetupVariablesUpsert.mockResolvedValueOnce({ created: 0, updated: 0, errors: [] });
    const secretPort = { upsertSecrets: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 1, errors: [] }) };
    const noOpProvisioning = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels }, { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag }, { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
      { upsert: mockSetupVariablesUpsert }, secretPort,
    );
    const result = await noOpProvisioning.invoke(baseParam({ inputs: { setupConfiguration, setupRemoteConfiguration: repositorySnapshot,
      setupCredentials: { workflowPat: { name: 'PAT', value: 'fake-workflow-token' }, apiKeys: [] } } }));
    expect(result[0].success).toBe(true);
    expect(secretPort.upsertSecrets).toHaveBeenCalledTimes(1);
    expect(mockSetupVariablesUpsert).toHaveBeenCalledTimes(1);
    expect(getResultPayload(getResultPayload(result[0].payload)?.setupReceipt)?.effects).toEqual(expect.arrayContaining([
      { id: 'secrets', state: 'skipped', scope: 'repository' },
      { id: 'variables', state: 'skipped', scope: 'repository' },
    ]));
  });

  it('marks a failed Variable write for inspection and retains mixed scope even when setup stops early', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.storage.variables.overrides = { AGENT_PROVIDER: 'organization' };
    mockSetupHasValidToken.mockReturnValueOnce(false);
    const stopped = await useCase.invoke(baseParam({ inputs: { setupConfiguration } }));
    expect(getResultPayload(getResultPayload(stopped[0].payload)?.setupReceipt)?.effects)
      .toContainEqual({ id: 'variables', state: 'not-started', scope: 'mixed' });
    setupConfiguration.storage.variables.overrides = {};
    mockSetupVariablesUpsert.mockResolvedValueOnce({ created: 0, updated: 0, errors: ['Variable write denied'] });
    const failed = await useCase.invoke(baseParam({ inputs: { setupConfiguration, setupRemoteConfiguration: repositorySnapshot } }));
    expect(getResultPayload(getResultPayload(failed[0].payload)?.setupReceipt)?.effects)
      .toContainEqual({ id: 'variables', state: 'needs-inspection', scope: 'repository' });
  });

  it('never reports Variables or Secrets completed when their provisioning adapters are absent', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    const noProvisioningPorts = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels }, { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag }, { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
    );
    const inputs = { setupConfiguration, setupRemoteConfiguration: repositorySnapshot,
      setupCredentials: { workflowPat: { name: 'PAT', value: 'fake-workflow-token' }, apiKeys: [] } };
    const result = await noProvisioningPorts.invoke(baseParam({ inputs }));
    expect(result[0].success).toBe(false);
    expect(mockSetupPrepare).not.toHaveBeenCalled();
    expect(result[0].errors?.map(error => error.message)).toEqual(expect.arrayContaining([
      'GitHub Actions Variable provisioning is unavailable; no Variables were changed.',
      'GitHub Actions Secret provisioning is unavailable; no Secrets were changed.',
    ]));
    expect(getResultPayload(getResultPayload(result[0].payload)?.setupReceipt)?.effects).toEqual(expect.arrayContaining([
      { id: 'variables', state: 'not-started', scope: 'repository' },
      { id: 'secrets', state: 'not-started', scope: 'repository' },
    ]));
  });

  it('marks a failed local write as needing inspection and later resources as not started', async () => {
    mockSetupPrepare.mockImplementationOnce(() => { throw new Error('write may have happened'); });
    const results = await useCase.invoke(baseParam());
    const effects = getResultPayload(getResultPayload(results[0].payload)?.setupReceipt)?.effects;
    expect(results[0].success).toBe(false);
    expect(effects).toEqual(expect.arrayContaining([
      { id: 'files', state: 'needs-inspection', scope: 'local' },
      { id: 'secrets', state: 'not-started', scope: 'repository' },
      { id: 'labels', state: 'not-started', scope: 'repository' },
    ]));
  });

  it('emits ordered, value-free resource progress before the final receipt', async () => {
    const progress = jest.fn();
    const observed = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels },
      { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag },
      { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
      { upsert: mockSetupVariablesUpsert },
      undefined, undefined, progress,
    );
    const result = await observed.invoke(baseParam());
    expect(progress.mock.calls.map(([effect]) => `${effect.id}:${effect.state}`)).toEqual([
      'files:in-progress', 'files:completed', 'secrets:skipped', 'labels:in-progress',
      'labels:skipped', 'issue-types:in-progress', 'issue-types:skipped',
      'variables:skipped', 'initial-tag:in-progress', 'initial-tag:skipped',
    ]);
    expect(JSON.stringify(progress.mock.calls)).not.toContain('fake-workflow-token');
    expect(getResultPayload(getResultPayload(result[0].payload)?.setupReceipt)?.effects)
      .toEqual(expect.arrayContaining([{ id: 'files', state: 'completed', scope: 'local' }]));
  });

  it('creates default tag v1.0.0 when no version tags exist', async () => {
    mockGetLatestTag.mockResolvedValue(undefined);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Default version tag v1.0.0 created'))).toBe(true);
    expect(mockGetDefaultBranch).toHaveBeenCalledWith();
    expect(mockCreateTag).toHaveBeenCalledWith('main', 'v1.0.0');
  });

  it('skips tag inspection and creation when release and hotfix issue workflows are disabled', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.issueWorkflows = { enabled: ['feature'] };
    setupConfiguration.manageRepositorySecrets = false;
    setupConfiguration.manageRepositoryVariables = false;
    await useCase.invoke(baseParam({ inputs: { setupConfiguration } }));
    expect(mockGetLatestTag).not.toHaveBeenCalled();
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it.each([
    ['authorization', 'authorization.denied'], ['invalid-input', 'validation.invalid-input'],
    ['conflict', 'provider.conflict'], ['rate-limited', 'provider.rate-limited'], ['unavailable', 'provider.unavailable'],
  ] as const)('reports the Variable name and phase with semantic reason %s', async (reason, code) => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.manageRepositorySecrets = false;
    setupConfiguration.features.release = false;
    setupConfiguration.features.hotfix = false;
    mockSetupVariablesUpsert.mockResolvedValueOnce({ created: 1, updated: 2,
      errors: ['Unable to configure repository Variable AGENT_MODEL.'],
      failures: [{ name: 'AGENT_MODEL', scope: 'repository', phase: 'update', reason }] });
    const [result] = await useCase.invoke(baseParam({ inputs: { setupConfiguration, setupRemoteConfiguration: repositorySnapshot } }));
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ code, message: expect.stringContaining('Variable AGENT_MODEL during update') })]);
    expect(getResultPayload(getResultPayload(result.payload)?.setupReceipt)?.effects)
      .toEqual(expect.arrayContaining([{ id: 'variables', state: 'needs-inspection', scope: 'repository' }]));
  });

  it('applies the selected setup files and repository Variables from the wizard configuration', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.features.release = false;
    setupConfiguration.features.hotfix = false;
    setupConfiguration.createInitialTag = false;
    const results = await useCase.invoke(baseParam({ inputs: { setupConfiguration, setupRemoteConfiguration: repositorySnapshot } }));

    expect(results[0].success).toBe(true);
    expect(mockSetupPrepare).toHaveBeenCalledWith({
      features: setupConfiguration.features,
      setupConfiguration,
    });
    expect(mockSetupVariablesUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([{ name: 'AGENT_PROVIDER', value: 'codex' }]),
    );
    expect(results[0].steps).toContain('⏭️  Initial version tag is not needed by the selected issue workflows.');
    expect(getResultPayload(getResultPayload(results[0].payload)?.setupReceipt)?.effects)
      .toEqual(expect.arrayContaining([{ id: 'initial-tag', state: 'skipped', scope: 'repository' },
        { id: 'variables', state: 'completed', scope: 'repository' }]));
  });

  it('provisions Variables at organization scope when the configuration selects it', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.features.release = false;
    setupConfiguration.features.hotfix = false;
    setupConfiguration.createInitialTag = false;
    setupConfiguration.manageRepositorySecrets = false;
    setupConfiguration.storage.variables.defaultScope = 'organization';
    const scopedUpsert = jest.fn().mockResolvedValue({ created: 1, updated: 0, errors: [] });
    const remoteConfiguration = {
      ownerType: 'Organization' as const,
      repositoryId: 42,
      repositoryVisibility: 'private' as const,
      repositorySecrets: [], repositorySecretsAccess: 'available' as const, organizationSecrets: [],
      repositoryVariables: [], repositoryVariablesAccess: 'available' as const, organizationVariables: [],
      organizationAccess: 'available' as const, organizationSecretsAccess: 'available' as const,
      organizationVariablesAccess: 'available' as const,
    };
    const inspect = jest.fn().mockResolvedValue(remoteConfiguration);
    const scopedUseCase = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels },
      { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag },
      { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
      { upsert: mockSetupVariablesUpsert, upsertScopedVariables: scopedUpsert },
      undefined,
      { inspect },
    );

    const results = await scopedUseCase.invoke(baseParam({ inputs: { setupConfiguration } }));

    expect(results[0].success).toBe(true);
    expect(inspect.mock.invocationCallOrder[0]).toBeLessThan(mockSetupPrepare.mock.invocationCallOrder[0]);
    expect(scopedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'organization', repositoryId: 42 }),
      expect.arrayContaining([{ name: 'AGENT_PROVIDER', value: 'codex' }]),
    );
    expect(mockSetupVariablesUpsert).not.toHaveBeenCalled();
    expect(mockSetupPrepare).toHaveBeenCalledTimes(1);
  });

  it('fails closed and does not upsert Variables when repository inventory cannot be inspected', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.manageRepositorySecrets = false;
    setupConfiguration.createInitialTag = false;
    const inspect = jest.fn().mockRejectedValue(new Error('sensitive provider response'));
    const readFailureUseCase = new InitialSetupUseCase(
      { getUser: mockGetUserFromToken, getUserDetails: jest.fn() },
      { ensureInitialLabels: mockEnsureInitialLabels },
      { ensureIssueTypes: mockEnsureIssueTypes },
      { getLatestTag: mockGetLatestTag },
      { getDefaultBranch: mockGetDefaultBranch } as any,
      { createTag: mockCreateTag } as any,
      { prepare: mockSetupPrepare, hasValidToken: mockSetupHasValidToken },
      { upsert: mockSetupVariablesUpsert },
      undefined,
      { inspect },
    );

    const results = await readFailureUseCase.invoke(baseParam({ inputs: { setupConfiguration } }));

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map(error => error.message)).toContain('Could not inspect existing GitHub Actions resource scopes.');
    expect(mockSetupVariablesUpsert).not.toHaveBeenCalled();
    expect(mockSetupPrepare).not.toHaveBeenCalled();
    expect(mockEnsureInitialLabels).not.toHaveBeenCalled();
    expect(mockEnsureIssueTypes).not.toHaveBeenCalled();
    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain('sensitive provider response');
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('does not mutate remote resources when the inventory read port is absent', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.manageRepositorySecrets = false;
    const results = await useCase.invoke(baseParam({ inputs: { setupConfiguration } }));

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map(error => error.message)).toContain(
      'Could not inspect existing GitHub Actions resource scopes. Restore inventory access and rerun setup.',
    );
    expect(mockSetupVariablesUpsert).not.toHaveBeenCalled();
    expect(mockSetupPrepare).not.toHaveBeenCalled();
    expect(mockEnsureInitialLabels).not.toHaveBeenCalled();
    expect(mockEnsureIssueTypes).not.toHaveBeenCalled();
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it('blocks every remote provisioning step when a selected inventory access state is unavailable', async () => {
    const setupConfiguration = createDefaultSetupConfiguration();
    setupConfiguration.manageRepositorySecrets = false;
    const inventory = { ...repositorySnapshot, repositoryVariablesAccess: 'unavailable' as const };
    const results = await useCase.invoke(baseParam({ inputs: {
      setupConfiguration, setupRemoteConfiguration: inventory,
    } }));
    expect(results[0].success).toBe(false);
    expect(mockSetupPrepare).not.toHaveBeenCalled();
    expect(mockSetupVariablesUpsert).not.toHaveBeenCalled();
    expect(mockEnsureInitialLabels).not.toHaveBeenCalled();
    expect(mockEnsureIssueTypes).not.toHaveBeenCalled();
    expect(mockCreateTag).not.toHaveBeenCalled();
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
    expect(results[0].errors.map((error) => error.message)).toContain('Label error');
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
    expect(results[0].errors.map((error) => error.message)).toContain('Progress error');
  });

  it('continues and reports errors when ensureIssueTypes returns success false', async () => {
    mockEnsureIssueTypes.mockResolvedValue({ success: false, created: 0, existing: 0, errors: ['Issue type error'] });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Issue type error');
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
