import type { SetupRemoteConfiguration, SetupCredentialRequirement } from '../../../../domain/setup';
import { SetupCredentialsUseCase } from '../setup_credentials_use_case';

const pat: SetupCredentialRequirement = { name: 'PAT', kind: 'workflowPat', description: 'Runtime bot' };
const key: SetupCredentialRequirement = { name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'Provider key', provider: 'openai' };

function fixture(overrides: Partial<SetupRemoteConfiguration> = {}) {
  const remote: SetupRemoteConfiguration = { ownerType: 'Organization', defaultBranch: 'master', repositoryId: 7, repositoryVisibility: 'private',
    repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [], organizationVariablesAccess: 'available',
    repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: ['PAT', 'OPENAI_API_KEY'],
    organizationSecretsAccess: 'available', organizationAccess: 'available', ...overrides };
  const prompt = { requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), requestWorkflowPat: jest.fn(),
    requestApiKey: jest.fn(), chooseExistingCredential: jest.fn(), showCredentialChecks: jest.fn() };
  const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'valid operator' }),
    validateCredential: jest.fn() };
  const legacyHealth = { validateExisting: jest.fn() };
  const trustedHealth = { validateTrustedDefault: jest.fn().mockResolvedValue(undefined) };
  const permissions = { inspect: jest.fn() };
  const useCase = new SetupCredentialsUseCase(prompt, validation, { list: jest.fn() }, legacyHealth,
    permissions, undefined, undefined, trustedHealth);
  const request = { owner: 'acme', repository: 'repo', setupToken: 'fixture-operator-token', requirements: [pat, key],
    manageSecrets: true, configurationSource: 'organization' as const, remoteConfiguration: remote,
    secretStoragePolicy: { defaultScope: 'organization' as const, organizationVisibility: 'selected' as const, preserveExisting: true, overrides: {} } };
  return { remote, prompt, validation, legacyHealth, trustedHealth, permissions, useCase, request };
}

describe('metadata-only existing Secret reuse', () => {
  it('checks only the selected existing alternative and preserves its trusted verification link', async () => {
    const f = fixture({ repositorySecrets: ['CODEX_API_KEY'] });
    const first = { ...key, name: 'CODEX_API_KEY', alternativeGroups: ['planner'] };
    f.trustedHealth.validateTrustedDefault.mockResolvedValue([{ name: first.name, status: 'valid', message: 'authenticated', verificationRunUrl: 'https://github.com/acme/repo/actions/runs/19' }]);
    const result = await f.useCase.collect({ ...f.request, requirements: [first, { ...key, alternativeGroups: ['planner'] }] });
    expect(result.collection.retainedSecrets).toEqual([{ name: first.name, scope: 'repository', status: 'valid' }]);
    expect(result.checks.find(check => check.name === first.name)?.verificationRunUrl).toBe('https://github.com/acme/repo/actions/runs/19');
    expect(f.trustedHealth.validateTrustedDefault).toHaveBeenCalledWith('acme', 'repo', f.request.setupToken, [first]);
    expect(f.prompt.requestApiKey).not.toHaveBeenCalled();
  });
  it('retains bindings as pending when no trusted-health capability is installed', async () => {
    const f = fixture(); const collector = new SetupCredentialsUseCase(f.prompt, f.validation, { list: jest.fn() });
    const result = await collector.collect(f.request);
    expect(result.collection.retainedSecrets?.every(binding => binding.status === 'unverifiable')).toBe(true);
    expect(f.legacyHealth.validateExisting).not.toHaveBeenCalled(); expect(f.prompt.requestApiKey).not.toHaveBeenCalled();
  });
  it('retains PAT and API-key bindings without reading, requesting or auditing their values', async () => {
    const f = fixture();
    const result = await f.useCase.collect(f.request);
    expect(result.collection).toEqual({ apiKeys: [], retainedSecrets: [
      { name: 'PAT', scope: 'organization', status: 'unverifiable' },
      { name: 'OPENAI_API_KEY', scope: 'organization', status: 'unverifiable' },
    ] });
    expect(f.prompt.requestWorkflowPat).not.toHaveBeenCalled();
    expect(f.prompt.requestApiKey).not.toHaveBeenCalled();
    expect(f.prompt.chooseExistingCredential).not.toHaveBeenCalled();
    expect(f.validation.validateCredential).not.toHaveBeenCalled();
    expect(f.permissions.inspect).not.toHaveBeenCalled();
    expect(f.legacyHealth.validateExisting).not.toHaveBeenCalled();
    expect(JSON.stringify(result.collection)).not.toContain('fixture-operator-token');
  });

  it('keeps runtime PAT permissions pending even after authentication succeeds', async () => {
    const f = fixture();
    f.trustedHealth.validateTrustedDefault.mockResolvedValue([
      { name: 'PAT', status: 'valid', message: 'authenticated' }, { name: 'OPENAI_API_KEY', status: 'valid', message: 'authenticated' },
    ]);
    const result = await f.useCase.collect({ ...f.request, ref: 'feature/untrusted-head' });
    expect(result.checks.find(check => check.name === 'PAT')).toMatchObject({ status: 'unverifiable' });
    expect(result.checks.find(check => check.name === 'OPENAI_API_KEY')).toMatchObject({ status: 'valid' });
    expect(f.trustedHealth.validateTrustedDefault).toHaveBeenCalledWith('acme', 'repo', 'fixture-operator-token', [pat, key]);
  });

  it.each(['invalid', 'missing'])('blocks reuse after a trusted required check reports %s', async status => {
    const f = fixture();
    f.trustedHealth.validateTrustedDefault.mockResolvedValue([{ name: 'PAT', status, message: 'raw provider detail' }]);
    await expect(f.useCase.collect(f.request)).rejects.toThrow('did not pass its trusted existing-credential check');
    expect(f.prompt.requestWorkflowPat).not.toHaveBeenCalled();
  });

  it('treats unavailable trusted evidence as pending without exposing a provider error', async () => {
    const f = fixture();
    f.trustedHealth.validateTrustedDefault.mockRejectedValue(new Error('private provider diagnostic'));
    const result = await f.useCase.collect(f.request);
    expect(result.collection.retainedSecrets?.every(binding => binding.status === 'unverifiable')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private provider diagnostic');
  });

  it('blocks a missing PAT instead of collecting a replacement value', async () => {
    const f = fixture({ organizationSecrets: ['OPENAI_API_KEY'] });
    await expect(f.useCase.collect(f.request)).rejects.toThrow('PAT is not available for reuse');
    expect(f.prompt.requestWorkflowPat).not.toHaveBeenCalled();
    expect(f.trustedHealth.validateTrustedDefault).not.toHaveBeenCalled();
  });

  it('retains an explicitly selected repository override without copying the organization Secret', async () => {
    const f = fixture({ repositorySecrets: ['PAT'] });
    const result = await f.useCase.collect({ ...f.request,
      secretStoragePolicy: { ...f.request.secretStoragePolicy, overrides: { PAT: 'repository' } } });
    expect(result.collection.retainedSecrets?.find(binding => binding.name === 'PAT')?.scope).toBe('repository');
    expect(f.prompt.requestWorkflowPat).not.toHaveBeenCalled();
  });

  it('rejects a reuse request that disables preservation', async () => {
    const f = fixture();
    await expect(f.useCase.collect({ ...f.request, secretStoragePolicy: { ...f.request.secretStoragePolicy, preserveExisting: false } }))
      .rejects.toThrow('cannot be moved or replaced by reuse');
    expect(f.prompt.requestWorkflowPat).not.toHaveBeenCalled();
  });

  it('does not rely on stale organization names when selected scope is repository', async () => {
    const f = fixture({ organizationSecretsAccess: 'unavailable' });
    await expect(f.useCase.collect({ ...f.request, requirements: [pat],
      secretStoragePolicy: { ...f.request.secretStoragePolicy, defaultScope: 'repository' } }))
      .rejects.toThrow('Organization Secret access is unknown');
  });

  it('does not enable organization reuse for an unknown owner', async () => {
    const f = fixture({ ownerType: 'Unknown' });
    await expect(f.useCase.collect(f.request)).rejects.toThrow('verified organization repository metadata');
  });

  it('leaves a selected runner-login alternative pending instead of requesting a new key', async () => {
    const f = fixture({ organizationSecrets: ['PAT'] });
    const alternative = { ...key, alternativeGroups: ['codex-login'], runnerAuthenticationGroups: ['codex-login'] };
    const result = await f.useCase.collect({ ...f.request, requirements: [pat, alternative] });
    expect(result.checks.find(check => check.name === key.name)?.status).toBe('not_required');
    expect(result.collection.retainedSecrets?.map(binding => binding.name)).toEqual(['PAT']);
    expect(f.prompt.requestApiKey).not.toHaveBeenCalled();
  });

  it('blocks an unsatisfied required alternative group', async () => {
    const f = fixture({ organizationSecrets: ['PAT'] });
    await expect(f.useCase.collect({ ...f.request, requirements: [pat, { ...key, alternativeGroups: ['provider-key'] }] }))
      .rejects.toThrow('required credential group has no accessible existing binding');
  });
});
