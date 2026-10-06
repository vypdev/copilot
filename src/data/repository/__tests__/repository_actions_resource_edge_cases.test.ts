import { randomBytes } from 'node:crypto';
import { RepositorySecretNamesQueryRepository, RepositoryVariablesQueryRepository,
    RepositorySecretsCommandRepository, RepositoryVariablesCommandRepository,
    SetupRemoteConfigurationQueryRepository } from '../repository_variables_repository';

function fixture() {
    const actions = {
        listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
        createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
        listRepoSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }),
        getRepoPublicKey: jest.fn().mockResolvedValue({ data: { key_id: 'key', key: randomBytes(32).toString('base64') } }),
        createOrUpdateRepoSecret: jest.fn(), getWorkflow: jest.fn(),
        listRepoOrganizationSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }),
        listRepoOrganizationVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
        listOrgVariables: jest.fn().mockResolvedValue({ data: { variables: [{ name: 'EXISTING', value: 'old', visibility: 'selected' }] } }),
        createOrgVariable: jest.fn(), updateOrgVariable: jest.fn(), addSelectedRepoToOrgVariable: jest.fn(),
        listOrgSecrets: jest.fn(), getOrgPublicKey: jest.fn(), createOrUpdateOrgSecret: jest.fn(),
    };
    const client = { rest: { actions, repos: { get: jest.fn().mockResolvedValue({ data: {
        id: 42, owner: { type: 'Organization' }, visibility: 'private', default_branch: 'main',
    } }) } } };
    const provider = { getClient: () => client };
    return { actions, client, provider };
}
const repositoryTarget = { scope: 'repository' as const, organizationVisibility: 'selected' as const };
const selectedTarget = { scope: 'organization' as const, organizationVisibility: 'selected' as const };

describe('Actions resource boundary edge cases', () => {
    it('preserves optional Variable values and accepts a flat collection from a narrow client', async () => {
        const { actions, provider } = fixture();
        actions.listRepoVariables.mockResolvedValue({ data: [{ name: 'PRESENT', value: 'value' }, { name: 'NO_VALUE' }] });
        await expect(new RepositoryVariablesQueryRepository(provider).listVariables('owner', 'repo', 'fixture'))
            .resolves.toEqual([{ name: 'PRESENT', value: 'value' }, { name: 'NO_VALUE' }]);
    });
    it.each([{}, { secrets: [null] }, { secrets: [{ name: '' }] }])('does not treat malformed Secret inventory %j as empty', async data => {
        const { actions, provider } = fixture();
        actions.listRepoSecrets.mockResolvedValue({ data });
        await expect(new RepositorySecretNamesQueryRepository(provider).list('owner', 'repo', 'fixture')).rejects.toThrow('invalid data');
        expect(actions.createOrUpdateRepoSecret).not.toHaveBeenCalled();
    });
    it('blocks a Secret query when its SDK endpoint is absent', async () => {
        const { actions, provider } = fixture();
        Reflect.deleteProperty(actions, 'listRepoSecrets');
        await expect(new RepositorySecretNamesQueryRepository(provider).list('owner', 'repo', 'fixture')).rejects.toThrow('API is unavailable');
    });
    it('blocks aggregate inspection when repository metadata cannot be queried', async () => {
        const { client, provider } = fixture();
        Reflect.deleteProperty(client.rest.repos, 'get');
        await expect(new SetupRemoteConfigurationQueryRepository(provider).inspect('owner', 'repo', 'fixture')).rejects.toThrow('metadata API');
    });
    it('cannot provision a repository Secret without its public-key endpoint', async () => {
        const { actions, provider } = fixture();
        Reflect.deleteProperty(actions, 'getRepoPublicKey');
        await expect(new RepositorySecretsCommandRepository(provider).upsertSecrets('owner', 'repo', 'fixture', []))
            .rejects.toThrow('API is unavailable');
        expect(actions.createOrUpdateRepoSecret).not.toHaveBeenCalled();
    });
    it.each(['secret', 'variable'] as const)('requires repository identity before configuring selected organization %s access', async kind => {
        const { actions, provider } = fixture();
        const operation = kind === 'secret'
            ? new RepositorySecretsCommandRepository(provider).upsertScopedSecrets('owner', 'repo', 'fixture', selectedTarget, [])
            : new RepositoryVariablesCommandRepository(provider).upsertScopedVariables('owner', 'repo', 'fixture', selectedTarget, []);
        await expect(operation).rejects.toThrow('repository ID is required');
        expect(actions.createOrUpdateOrgSecret).not.toHaveBeenCalled();
        expect(actions.createOrgVariable).not.toHaveBeenCalled();
    });
    it.each(['secret', 'variable'] as const)('rejects an unavailable organization %s write API before mutation', async kind => {
        const { actions, provider } = fixture();
        Reflect.deleteProperty(actions, kind === 'secret' ? 'getOrgPublicKey' : 'createOrgVariable');
        const target = { ...selectedTarget, repositoryId: 42 };
        const operation = kind === 'secret'
            ? new RepositorySecretsCommandRepository(provider).upsertScopedSecrets('owner', 'repo', 'fixture', target, [])
            : new RepositoryVariablesCommandRepository(provider).upsertScopedVariables('owner', 'repo', 'fixture', target, []);
        await expect(operation).rejects.toThrow('API is unavailable');
    });
    it('routes repository-scoped credentials through the actual repository Secrets endpoint', async () => {
        const { actions, provider } = fixture();
        await expect(new RepositorySecretsCommandRepository(provider).upsertScopedSecrets('owner', 'repo', 'fixture', repositoryTarget,
            [{ name: 'PAT', value: 'fixture-value' }])).resolves.toMatchObject({ created: 1, errors: [] });
        expect(actions.createOrUpdateRepoSecret).toHaveBeenCalledTimes(1);
        expect(actions.createOrUpdateOrgSecret).not.toHaveBeenCalled();
    });
    it('skips identical repository Variables through a scoped command', async () => {
        const { actions, provider } = fixture();
        actions.listRepoVariables.mockResolvedValue({ data: { variables: [{ name: 'MODE', value: 'same' }] } });
        await expect(new RepositoryVariablesCommandRepository(provider).upsertScopedVariables('owner', 'repo', 'fixture', repositoryTarget,
            [{ name: 'MODE', value: 'same' }])).resolves.toEqual({ created: 0, updated: 0, errors: [] });
        expect(actions.createRepoVariable).not.toHaveBeenCalled();
        expect(actions.updateRepoVariable).not.toHaveBeenCalled();
    });
    it('does not invent inventory access when organization endpoints are absent', async () => {
        const { actions, provider } = fixture();
        Reflect.deleteProperty(actions, 'listRepoOrganizationSecrets');
        Reflect.deleteProperty(actions, 'listRepoOrganizationVariables');
        await expect(new SetupRemoteConfigurationQueryRepository(provider).inspect('owner', 'repo', 'fixture'))
            .resolves.toMatchObject({ organizationSecretsAccess: 'unknown', organizationVariablesAccess: 'unknown', organizationAccess: 'unknown' });
    });
    it('preserves unavailable access when both organization inventories fail', async () => {
        const { actions, provider } = fixture();
        actions.listRepoOrganizationSecrets.mockRejectedValue(new Error('fixture denial'));
        actions.listRepoOrganizationVariables.mockRejectedValue(new Error('fixture denial'));
        await expect(new SetupRemoteConfigurationQueryRepository(provider).inspect('owner', 'repo', 'fixture'))
            .resolves.toMatchObject({ organizationSecretsAccess: 'unavailable', organizationVariablesAccess: 'unavailable', organizationAccess: 'unavailable' });
    });
    it.each([undefined, '../unsafe'])('does not project unsafe default branch %s or unknown owner/visibility metadata', async defaultBranch => {
        const { client, provider } = fixture();
        client.rest.repos.get.mockResolvedValue({ data: { id: 42, owner: { type: 'unexpected' }, visibility: 'unexpected', default_branch: defaultBranch } });
        const remote = await new SetupRemoteConfigurationQueryRepository(provider).inspect('owner', 'repo', 'fixture');
        expect(remote).toMatchObject({ ownerType: 'Unknown', repositoryVisibility: 'unknown', organizationAccess: 'not_applicable' });
        expect(remote.defaultBranch).toBeUndefined();
    });
    it('creates organization Variables without selected repository grants for private visibility', async () => {
        const { actions, provider } = fixture();
        await expect(new RepositoryVariablesCommandRepository(provider).upsertScopedVariables('owner', 'repo', 'fixture',
            { scope: 'organization', organizationVisibility: 'private' }, [{ name: 'NEW', value: 'value' }]))
            .resolves.toEqual({ created: 1, updated: 0, errors: [] });
        expect(actions.createOrgVariable).toHaveBeenCalledWith({ org: 'owner', name: 'NEW', value: 'value', visibility: 'private' });
        expect(actions.addSelectedRepoToOrgVariable).not.toHaveBeenCalled();
    });
    it('updates existing organization Variables while preserving visibility and adding repository access', async () => {
        const { actions, provider } = fixture();
        await expect(new RepositoryVariablesCommandRepository(provider).upsertScopedVariables('owner', 'repo', 'fixture',
            { ...selectedTarget, organizationVisibility: 'all', repositoryId: 42 }, [{ name: 'EXISTING', value: 'new' }]))
            .resolves.toEqual({ created: 0, updated: 1, errors: [] });
        expect(actions.updateOrgVariable).toHaveBeenCalledWith({ org: 'owner', name: 'EXISTING', value: 'new', visibility: 'selected' });
        expect(actions.addSelectedRepoToOrgVariable).toHaveBeenCalledWith({ org: 'owner', name: 'EXISTING', repository_id: 42 });
        expect(actions.createOrgVariable).not.toHaveBeenCalled();
    });
});
