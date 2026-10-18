import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../../../policies/setup_configuration_plan';
import { ensureRepositorySecrets, ensureRepositoryVariables, resolveRemoteConfiguration } from '../setup_resource_provisioning';
import type { SetupRemoteConfiguration } from '../../../../domain/setup';

function fixture() {
  const configuration = createDefaultSetupConfiguration();
  const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryVisibility: 'private', repositoryId: 7,
    defaultBranch: 'master', organizationAccess: 'available', repositoryVariablesAccess: 'available',
    organizationVariablesAccess: 'available', repositorySecretsAccess: 'available', organizationSecretsAccess: 'available',
    repositoryVariables: [], organizationVariables: buildSetupRepositoryVariables(configuration), repositorySecrets: [], organizationSecrets: ['PAT'], organizationSecretRevisions: [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }] };
  const upsert = jest.fn().mockResolvedValue({ created: 1, updated: 0, errors: [] });
  const scoped = jest.fn(); const secrets = jest.fn(); const scopedSecrets = jest.fn();
  const dependencies = { setupRepositoryVariablesPort: { createMissing: upsert, upsert: jest.fn(), upsertScopedVariables: scoped },
    setupRepositorySecretsPort: { upsertSecrets: secrets, upsertScopedSecrets: scopedSecrets },
    setupRemoteConfigurationReadPort: { inspect: jest.fn().mockResolvedValue(remote) } };
  const context = { setupConfigurationSource: 'organization' as const, setupRemoteConfiguration: remote,
    setupCredentials: { apiKeys: [], retainedSecrets: [{ name: 'PAT', scope: 'organization' as const, status: 'unverifiable' as const }] } };
  return { configuration, remote, dependencies, context, upsert, scoped, secrets, scopedSecrets };
}

describe('organization reuse provisioning boundary', () => {
  it('requires the create-only capability for a missing target override', async () => {
    const f = fixture(); f.configuration.ai.bugbotCommentLimit = 19;
    const dependencies = { ...f.dependencies, setupRepositoryVariablesPort: { ...f.dependencies.setupRepositoryVariablesPort, createMissing: undefined } };
    expect(await ensureRepositoryVariables(f.context, dependencies, f.configuration, f.remote)).toMatchObject({ writes: 0, errors: [expect.stringContaining('unguarded writer')] });
    expect(f.dependencies.setupRepositoryVariablesPort.upsert).not.toHaveBeenCalled();
  });
  it('blocks an existing target override that requires a different value', async () => {
    const f = fixture(); f.configuration.ai.bugbotCommentLimit = 19;
    f.remote.repositoryVariables = [{ name: 'BUGBOT_COMMENT_LIMIT', value: 'original' }];
    expect(await ensureRepositoryVariables(f.context, f.dependencies, f.configuration, f.remote)).toMatchObject({ writes: 0, errors: [expect.stringContaining('separate manual update')] });
    expect(f.upsert).not.toHaveBeenCalled(); expect(f.dependencies.setupRepositoryVariablesPort.upsert).not.toHaveBeenCalled();
  });
  it.each(['repositorySecretRevisions', 'organizationSecretRevisions'] as const)('rejects two identical missing %s readings', async field => {
    const f = fixture(); f.remote.repositorySecrets = ['PAT']; f.remote.repositorySecretRevisions = [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }];
    f.remote[field] = undefined;
    const errors: string[] = [];
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeUndefined();
    expect(errors).toHaveLength(1); expect(f.upsert).not.toHaveBeenCalled();
  });
  it('performs zero value writes for an unchanged shared configuration and retained PAT', async () => {
    const f = fixture();
    expect(await ensureRepositoryVariables(f.context, f.dependencies, f.configuration, f.remote)).toMatchObject({ errors: [], writes: 0 });
    expect(await ensureRepositorySecrets(f.context, f.dependencies, f.configuration, f.remote)).toMatchObject({ errors: [], writes: 0 });
    for (const spy of [f.upsert, f.scoped, f.secrets, f.scopedSecrets]) expect(spy).not.toHaveBeenCalled();
  });
  it('writes a reviewed difference exclusively to this repository', async () => {
    const f = fixture(); f.configuration.ai.bugbotCommentLimit = 19;
    expect(await ensureRepositoryVariables(f.context, f.dependencies, f.configuration, f.remote)).toMatchObject({ errors: [], writes: 1 });
    expect(f.upsert).toHaveBeenCalledWith([{ name: 'BUGBOT_COMMENT_LIMIT', value: '19' }]);
    expect(f.scoped).not.toHaveBeenCalled();
  });
  it('blocks any supplied Secret replacement before a writer is called', async () => {
    const f = fixture();
    const result = await ensureRepositorySecrets({ ...f.context, setupCredentials: { apiKeys: [],
      workflowPat: { name: 'PAT', value: 'fixture-not-a-real-secret' } } }, f.dependencies, f.configuration, f.remote);
    expect(result.errors).toEqual([expect.stringContaining('cannot replace')]);
    expect(f.secrets).not.toHaveBeenCalled(); expect(f.scopedSecrets).not.toHaveBeenCalled();
  });
  it('rechecks inventory rather than trusting the plan snapshot', async () => {
    const f = fixture(); const errors: string[] = [];
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toEqual(f.remote);
    expect(f.dependencies.setupRemoteConfigurationReadPort.inspect).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });
  it('does not treat inventory ordering as a configuration change', async () => {
    const f = fixture(); const errors: string[] = [];
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockResolvedValue({ ...f.remote,
      organizationVariables: [...f.remote.organizationVariables].reverse() });
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeDefined();
    expect(errors).toEqual([]);
  });
  it.each([
    ['installed', 'missing'], ['missing', 'installed'], ['installed', 'unavailable'],
  ] as const)('blocks credential-health workflow drift from %s to %s before provisioning', async (before, after) => {
    const f = fixture(); const errors: string[] = [];
    f.remote.credentialHealthWorkflow = before;
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockResolvedValue({ ...f.remote, credentialHealthWorkflow: after });
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeUndefined();
    expect(errors).toEqual([expect.stringContaining('changed after review')]);
    for (const writer of [f.upsert, f.scoped, f.secrets, f.scopedSecrets]) expect(writer).not.toHaveBeenCalled();
  });
  it.each(['binding', 'repository', 'branch', 'access', 'visibility'] as const)('blocks %s drift before files or values change', async change => {
    const f = fixture(); const errors: string[] = [];
    const fresh = { ...f.remote };
    if (change === 'binding') { fresh.organizationSecrets = []; fresh.organizationSecretRevisions = []; }
    if (change === 'repository') fresh.repositoryId = 8;
    if (change === 'branch') fresh.defaultBranch = 'main';
    if (change === 'visibility') fresh.repositoryVisibility = 'public';
    if (change === 'access') fresh.organizationVariablesAccess = 'unknown';
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockResolvedValue(fresh);
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeUndefined();
    expect(errors).toEqual([expect.stringContaining('changed after review')]);
  });
  it.each(['repositorySecretRevisions', 'organizationSecretRevisions'] as const)('blocks a same-name retained %s rotation before Apply', async field => {
    const f = fixture(); const errors: string[] = [];
    if (field === 'repositorySecretRevisions') f.remote.repositorySecrets = ['PAT'];
    f.remote[field] = [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }];
    const fresh = { ...f.remote, [field]: [{ name: 'PAT', updatedAt: '2026-10-17T00:01:00Z' }] };
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockResolvedValue(fresh);
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeUndefined();
    expect(errors).toEqual([expect.stringContaining('changed after review')]);
    for (const writer of [f.upsert, f.scoped, f.secrets, f.scopedSecrets]) expect(writer).not.toHaveBeenCalled();
  });
  it('keeps Secret metadata ordering stable without hiding a lost revision', async () => {
    const f = fixture(); const errors: string[] = [];
    f.remote.organizationSecrets = ['PAT', 'OTHER'];
    f.remote.organizationSecretRevisions = [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }, { name: 'OTHER', updatedAt: '2026-10-17T00:00:00Z' }];
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockResolvedValue({ ...f.remote, organizationSecretRevisions: [...f.remote.organizationSecretRevisions].reverse() });
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeDefined();
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockResolvedValue({ ...f.remote, organizationSecretRevisions: undefined });
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, errors)).toBeUndefined();
  });
  it('blocks missing reader or failed reinspection without exposing provider details', async () => {
    const f = fixture(); const missing: string[] = []; const failed: string[] = [];
    expect(await resolveRemoteConfiguration(f.context, {}, f.configuration, missing)).toBeUndefined();
    f.dependencies.setupRemoteConfigurationReadPort.inspect.mockRejectedValue(new Error('private provider details'));
    expect(await resolveRemoteConfiguration(f.context, f.dependencies, f.configuration, failed)).toBeUndefined();
    expect(missing.join()).toContain('fresh inventory'); expect(failed.join()).toContain('revalidated');
    expect(failed.join()).not.toContain('private');
  });
});
