import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import {
    ensureRepositorySecrets,
    ensureRepositoryVariables,
    groupSetupResources,
    resolveRemoteConfiguration,
} from '../setup_resource_provisioning';

const context = {
    owner: 'owner',
    repo: 'repo',
    token: 'token',
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
            organizationSecrets: [],
            repositoryVariables: [{ name: 'AGENT_MODEL', value: 'inherited' }],
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
            organizationSecrets: [],
            repositoryVariables: [],
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
            { setupRepositorySecretsPort: { list: jest.fn(), upsertSecrets } },
            configuration,
        );

        expect(result.errors).toEqual([]);
        expect(result.step).toContain('1 created, 1 updated');
        expect(upsertSecrets).toHaveBeenCalledWith('owner', 'repo', 'token', [
            { name: 'PAT', value: 'workflow-token' },
            { name: 'OPENAI_API_KEY', value: 'api-key' },
        ]);
    });

    it('reports when setup secrets are enabled without validated credentials', async () => {
        const result = await ensureRepositorySecrets(
            context,
            { setupRepositorySecretsPort: { list: jest.fn(), upsertSecrets: jest.fn() } },
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
                organizationSecrets: [],
                repositoryVariables: [],
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
            organizationSecrets: [],
            repositoryVariables: [],
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
});
