import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import {
    ensureRepositorySecrets,
    ensureRepositoryVariables,
    groupSetupResources,
    resolveRemoteConfiguration,
} from '../setup_resource_provisioning';

const context = {
    setupCredentials: undefined,
};
const repositorySnapshot = {
    ownerType: 'User' as const,
    repositoryVisibility: 'private' as const,
    repositorySecrets: [], repositorySecretsAccess: 'available' as const,
    organizationSecrets: [],
    repositoryVariables: [], repositoryVariablesAccess: 'available' as const,
    organizationVariables: [],
    organizationAccess: 'not_applicable' as const,
    organizationSecretsAccess: 'not_applicable' as const,
    organizationVariablesAccess: 'not_applicable' as const,
};

describe('setup resource provisioning policy', () => {
    it('keeps an effective inherited variable instead of shadowing it', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';
        const groups = groupSetupResources([
            { name: 'AGENT_PROVIDER', value: 'codex' },
            { name: 'AGENT_MODEL', value: 'gpt-5.6' },
        ], 'variable', configuration, {
            ownerType: 'Organization',
            repositoryId: 42,
            repositoryVisibility: 'private',
            repositorySecrets: [],
            repositorySecretsAccess: 'available',
            organizationSecrets: [],
            repositoryVariables: [{ name: 'AGENT_MODEL', value: 'inherited' }],
            repositoryVariablesAccess: 'available',
            organizationVariables: [],
            organizationAccess: 'available',
            organizationSecretsAccess: 'available',
            organizationVariablesAccess: 'available',
        });

        expect(groups).toHaveLength(1);
        expect(groups[0].target.scope).toBe('organization');
        expect(groups[0].resources).toEqual([{ name: 'AGENT_PROVIDER', value: 'codex' }]);
    });

    it('groups resources by explicit scope and preserves target metadata', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.secrets.defaultScope = 'organization';
        configuration.storage.secrets.overrides = { PAT: 'repository' };

        const groups = groupSetupResources([
            { name: 'PAT', value: 'workflow-token' },
            { name: 'OPENAI_API_KEY', value: 'api-key' },
        ], 'secret', configuration, {
            ownerType: 'Organization',
            repositoryId: 7,
            repositoryVisibility: 'private',
            repositorySecrets: [],
            repositorySecretsAccess: 'available',
            organizationSecrets: [],
            repositoryVariables: [],
            repositoryVariablesAccess: 'available',
            organizationVariables: [],
            organizationAccess: 'available',
            organizationSecretsAccess: 'available',
            organizationVariablesAccess: 'available',
        });

        expect(groups).toEqual([
            {
                target: { scope: 'repository', organizationVisibility: 'selected', repositoryId: 7 },
                resources: [{ name: 'PAT', value: 'workflow-token' }],
            },
            {
                target: { scope: 'organization', organizationVisibility: 'selected', repositoryId: 7 },
                resources: [{ name: 'OPENAI_API_KEY', value: 'api-key' }],
            },
        ]);
    });

    it('provisions validated credentials through the repository secret port', async () => {
        const upsertSecrets = jest.fn().mockResolvedValue({ created: 1, updated: 1, skipped: 0, errors: [] });
        const configuration = createDefaultSetupConfiguration();

        const result = await ensureRepositorySecrets(
            {
                ...context,
                setupCredentials: {
                    workflowPat: { name: 'PAT', value: 'workflow-token' },
                    apiKeys: [{ name: 'OPENAI_API_KEY', value: 'api-key' }],
                },
            },
            { setupRepositorySecretsPort: { upsertSecrets } },
            configuration,
            repositorySnapshot,
        );

        expect(result.errors).toEqual([]);
        expect(result.writes).toBe(2);
        expect(result.step).toContain('1 created, 1 updated');
        expect(upsertSecrets).toHaveBeenCalledWith([
            { name: 'PAT', value: 'workflow-token' },
            { name: 'OPENAI_API_KEY', value: 'api-key' },
        ]);
    });

    it('reports when setup secrets are enabled without validated credentials', async () => {
        const upsertSecrets = jest.fn();
        const result = await ensureRepositorySecrets(
            context,
            { setupRepositorySecretsPort: { upsertSecrets } },
            createDefaultSetupConfiguration(),
        );

        expect(result.errors).toEqual([]);
        expect(result.writes).toBe(0);
        expect(result.step).toContain('were not changed');
        const empty = await ensureRepositorySecrets({ setupCredentials: { apiKeys: [] } },
            { setupRepositorySecretsPort: { upsertSecrets } }, createDefaultSetupConfiguration());
        expect(empty).toMatchObject({ writes: 0, errors: [], step: expect.stringContaining('kept unchanged') });
        expect(upsertSecrets).not.toHaveBeenCalled();
    });

    it('fails closed when a managed resource has values to write but its provisioning port is absent', async () => {
        const configuration = createDefaultSetupConfiguration();
        expect(await ensureRepositoryVariables(context, {}, configuration, repositorySnapshot)).toEqual({
            errors: ['GitHub Actions Variable provisioning is unavailable; no Variables were changed.'],
            writes: 0,
        });
        expect(await ensureRepositorySecrets({ setupCredentials: {
            workflowPat: { name: 'PAT', value: 'fake-workflow-token' }, apiKeys: [],
        } }, {}, configuration, repositorySnapshot)).toEqual({
            errors: ['GitHub Actions Secret provisioning is unavailable; no Secrets were changed.'],
            writes: 0,
        });
        configuration.manageRepositoryVariables = false;
        configuration.manageRepositorySecrets = false;
        expect(await ensureRepositoryVariables(context, {}, configuration, repositorySnapshot)).toEqual({ errors: [], writes: 0 });
        expect(await ensureRepositorySecrets(context, {}, configuration, repositorySnapshot)).toEqual({ errors: [], writes: 0 });
    });

    it('returns zero writes and an unchanged explanation when all requested values are skipped', async () => {
        const configuration = createDefaultSetupConfiguration();
        const variables = await ensureRepositoryVariables(context, { setupRepositoryVariablesPort: {
            upsert: jest.fn().mockResolvedValue({ created: 0, updated: 0, errors: [] }),
        } }, configuration, repositorySnapshot);
        const secrets = await ensureRepositorySecrets({ setupCredentials: {
            workflowPat: { name: 'PAT', value: 'fake-workflow-token' }, apiKeys: [],
        } }, { setupRepositorySecretsPort: {
            upsertSecrets: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 1, errors: [] }),
        } }, configuration, repositorySnapshot);
        expect(variables).toMatchObject({ writes: 0, errors: [], step: expect.stringContaining('kept unchanged') });
        expect(secrets).toMatchObject({ writes: 0, errors: [], step: expect.stringContaining('kept unchanged') });
    });

    it('uses the organization variable port when the resolved target is organizational', async () => {
        const upsertScopedVariables = jest.fn().mockResolvedValue({ created: 2, updated: 0, errors: [] });
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';

        const result = await ensureRepositoryVariables(
            context,
            { setupRepositoryVariablesPort: { upsert: jest.fn(), upsertScopedVariables } },
            configuration,
            {
                ownerType: 'Organization',
                repositoryId: 42,
                repositoryVisibility: 'private',
                repositorySecrets: [],
                repositorySecretsAccess: 'available',
                organizationSecrets: [],
                repositoryVariables: [],
                repositoryVariablesAccess: 'available',
                organizationVariables: [],
                organizationAccess: 'available',
                organizationSecretsAccess: 'available',
                organizationVariablesAccess: 'available',
            },
        );

        expect(result.errors).toEqual([]);
        expect(result.step).toContain('2 created, 0 updated');
        expect(upsertScopedVariables).toHaveBeenCalled();
    });

    it('returns a provided remote snapshot without calling the read port', async () => {
        const provided = {
            ownerType: 'User' as const,
            repositoryVisibility: 'public' as const,
            repositorySecrets: [],
            repositorySecretsAccess: 'available' as const,
            organizationSecrets: [],
            repositoryVariables: [],
            repositoryVariablesAccess: 'available' as const,
            organizationVariables: [],
            organizationAccess: 'not_applicable' as const,
            organizationSecretsAccess: 'not_applicable' as const,
            organizationVariablesAccess: 'not_applicable' as const,
        };
        const inspect = jest.fn();

        await expect(resolveRemoteConfiguration(
            { ...context, setupRemoteConfiguration: provided },
            { setupRemoteConfigurationReadPort: { inspect } },
            createDefaultSetupConfiguration(),
            [],
        )).resolves.toBe(provided);

        expect(inspect).not.toHaveBeenCalled();
    });

    it('blocks resource grouping when selected repository inventory is unavailable', () => {
        const configuration = createDefaultSetupConfiguration();
        expect(() => groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-5.6' }], 'variable', configuration, {
            ownerType: 'User',
            repositoryVisibility: 'private',
            repositorySecrets: [],
            repositorySecretsAccess: 'available',
            organizationSecrets: [],
            repositoryVariables: [],
            repositoryVariablesAccess: 'unavailable',
            organizationVariables: [],
            organizationAccess: 'not_applicable',
            organizationSecretsAccess: 'not_applicable',
            organizationVariablesAccess: 'not_applicable',
        })).toThrow('resource targets cannot be resolved safely');
    });

    it.each(['secret', 'variable'] as const)('fails closed without any %s inventory snapshot', kind => {
        const configuration = createDefaultSetupConfiguration();
        expect(() => groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-5.6' }], kind, configuration))
            .toThrow('resource targets cannot be resolved safely');
        expect(groupSetupResources([], kind, configuration)).toEqual([]);
    });

    it('never upserts selected variables or credentials when inventory is absent', async () => {
        const configuration = createDefaultSetupConfiguration();
        const upsert = jest.fn();
        const upsertSecrets = jest.fn();
        const variables = await ensureRepositoryVariables(context, { setupRepositoryVariablesPort: { upsert } }, configuration);
        const secrets = await ensureRepositorySecrets(
            { setupCredentials: { workflowPat: { name: 'PAT', value: 'token' }, apiKeys: [] } },
            { setupRepositorySecretsPort: { upsertSecrets } },
            configuration,
        );
        expect(variables.errors).toEqual([expect.stringContaining('Restore inventory access and rerun setup.')]);
        expect(secrets.errors).toEqual([expect.stringContaining('Restore inventory access and rerun setup.')]);
        expect(upsert).not.toHaveBeenCalled();
        expect(upsertSecrets).not.toHaveBeenCalled();
    });

    it('blocks organization-only resources without repository shadow inventory', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';
        configuration.storage.variables.preserveExisting = false;

        expect(() => groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-5.6' }], 'variable', configuration, {
            ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
            repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
            repositoryVariables: [], repositoryVariablesAccess: 'unavailable', organizationVariables: [],
            organizationAccess: 'available', organizationSecretsAccess: 'available',
            organizationVariablesAccess: 'available',
        })).toThrow('Repository variable inventory is unavailable');
    });

    it('groups organization resources only when repository inventory proves no shadow', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';
        configuration.storage.variables.preserveExisting = false;

        expect(groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-6-luna' }], 'variable', configuration, {
            ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
            repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
            repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [],
            organizationAccess: 'available', organizationSecretsAccess: 'available',
            organizationVariablesAccess: 'available',
        })).toEqual([{
            target: { scope: 'organization', organizationVisibility: 'selected', repositoryId: 42 },
            resources: [{ name: 'AGENT_MODEL', value: 'gpt-6-luna' }],
        }]);
    });

    it('rejects a known repository value that would shadow an organization target', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';
        configuration.storage.variables.preserveExisting = false;

        expect(() => groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-6-luna' }], 'variable', configuration, {
            ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
            repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
            repositoryVariables: [{ name: 'AGENT_MODEL', value: 'old' }], repositoryVariablesAccess: 'available',
            organizationVariables: [], organizationAccess: 'available',
            organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
        })).toThrow('Repository variable AGENT_MODEL shadows');
    });

    it('blocks preservation when organization inventory is unavailable', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'repository';
        configuration.storage.variables.preserveExisting = true;

        expect(() => groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-5.6' }], 'variable', configuration, {
            ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
            repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
            repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [],
            organizationAccess: 'unavailable', organizationSecretsAccess: 'available',
            organizationVariablesAccess: 'unavailable',
        })).toThrow('Organization variable inventory is unavailable');
    });

    it('does not expose a raw variable-provider failure', async () => {
        const configuration = createDefaultSetupConfiguration();
        const result = await ensureRepositoryVariables(
            context,
            { setupRepositoryVariablesPort: {
                upsert: jest.fn().mockRejectedValue(new Error('variable-secret-marker')),
            } },
            configuration,
            repositorySnapshot,
        );
        expect(result.errors).toEqual(['Unable to configure GitHub Actions Variables.']);
        expect(JSON.stringify(result)).not.toContain('variable-secret-marker');
    });

    it('does not expose a raw secret-provider failure', async () => {
        const configuration = createDefaultSetupConfiguration();
        const result = await ensureRepositorySecrets(
            { setupCredentials: {
                workflowPat: { name: 'PAT', value: 'workflow-token' },
                apiKeys: [],
            } },
            { setupRepositorySecretsPort: {
                upsertSecrets: jest.fn().mockRejectedValue(new Error('secret-provider-marker')),
            } },
            configuration,
            repositorySnapshot,
        );
        expect(result.errors).toEqual(['Unable to configure GitHub Actions Secrets.']);
        expect(JSON.stringify(result)).not.toContain('secret-provider-marker');
    });

    it('does not expose a raw remote-scope inspection failure', async () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';
        const errors: string[] = [];
        await expect(resolveRemoteConfiguration(
            context,
            { setupRemoteConfigurationReadPort: {
                inspect: jest.fn().mockRejectedValue(new Error('remote-scope-marker')),
            } },
            configuration,
            errors,
        )).resolves.toBeUndefined();
        expect(errors).toEqual(['Could not inspect existing GitHub Actions resource scopes.']);
        expect(JSON.stringify(errors)).not.toContain('remote-scope-marker');
    });

    it('reports a repository-scoped inspection failure as blocking', async () => {
        const errors: string[] = [];
        await expect(resolveRemoteConfiguration(
            context,
            { setupRemoteConfigurationReadPort: {
                inspect: jest.fn().mockRejectedValue(new Error('repository-scope-marker')),
            } },
            createDefaultSetupConfiguration(),
            errors,
        )).resolves.toBeUndefined();

        expect(errors).toEqual(['Could not inspect existing GitHub Actions resource scopes.']);
    });
});


test('a missing organization Variable writer reports an unavailable operation without a repository fallback', async () => {
 const configuration=createDefaultSetupConfiguration(); configuration.storage.variables.defaultScope='organization';
 const upsert=jest.fn();
 const result=await ensureRepositoryVariables(context,{setupRepositoryVariablesPort:{upsert}},configuration,{
  ...repositorySnapshot,ownerType:'Organization',repositoryId:42,organizationAccess:'available',organizationSecretsAccess:'available',organizationVariablesAccess:'available',
 });
 expect(result).toEqual({writes:0,errors:['Organization Variable provisioning is not available in this installation.']});
 expect(upsert).not.toHaveBeenCalled();
});
