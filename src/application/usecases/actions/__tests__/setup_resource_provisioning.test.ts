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
        );

        expect(result.errors).toEqual([]);
        expect(result.step).toContain('1 created, 1 updated');
        expect(upsertSecrets).toHaveBeenCalledWith([
            { name: 'PAT', value: 'workflow-token' },
            { name: 'OPENAI_API_KEY', value: 'api-key' },
        ]);
    });

    it('reports when setup secrets are enabled without validated credentials', async () => {
        const result = await ensureRepositorySecrets(
            context,
            { setupRepositorySecretsPort: { upsertSecrets: jest.fn() } },
            createDefaultSetupConfiguration(),
        );

        expect(result.errors).toEqual([]);
        expect(result.step).toContain('were not changed');
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

    it('groups organization-only resources without unrelated repository inventory', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.variables.defaultScope = 'organization';
        configuration.storage.variables.preserveExisting = false;

        expect(groupSetupResources([{ name: 'AGENT_MODEL', value: 'gpt-5.6' }], 'variable', configuration, {
            ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
            repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
            repositoryVariables: [], repositoryVariablesAccess: 'unavailable', organizationVariables: [],
            organizationAccess: 'available', organizationSecretsAccess: 'available',
            organizationVariablesAccess: 'available',
        })).toEqual([{
            target: { scope: 'organization', organizationVisibility: 'selected', repositoryId: 42 },
            resources: [{ name: 'AGENT_MODEL', value: 'gpt-5.6' }],
        }]);
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

    it('keeps a repository-scoped inspection failure advisory instead of blocking setup', async () => {
        const errors: string[] = [];
        await expect(resolveRemoteConfiguration(
            context,
            { setupRemoteConfigurationReadPort: {
                inspect: jest.fn().mockRejectedValue(new Error('repository-scope-marker')),
            } },
            createDefaultSetupConfiguration(),
            errors,
        )).resolves.toBeUndefined();

        expect(errors).toEqual([]);
    });
});
