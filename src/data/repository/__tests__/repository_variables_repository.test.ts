import { RepositoryVariablesRepository } from '../repository_variables_repository';
import { randomBytes } from 'node:crypto';

describe('RepositoryVariablesRepository', () => {
    it('creates missing variables and updates existing variables', async () => {
        const listRepoVariables = jest.fn().mockResolvedValue({ data: { variables: [{ name: 'EXISTING' }] } });
        const createRepoVariable = jest.fn().mockResolvedValue(undefined);
        const updateRepoVariable = jest.fn().mockResolvedValue(undefined);
        const client = { rest: { actions: { listRepoVariables, createRepoVariable, updateRepoVariable } } };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });

        const result = await repository.upsert('owner', 'repo', 'token', [
            { name: 'EXISTING', value: 'updated' },
            { name: 'NEW', value: 'created' },
        ]);

        expect(result).toEqual({ created: 1, updated: 1, errors: [] });
        expect(updateRepoVariable).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', name: 'EXISTING', value: 'updated' });
        expect(createRepoVariable).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', name: 'NEW', value: 'created' });
    });

    it('continues and reports an individual variable failure', async () => {
        const listRepoVariables = jest.fn().mockResolvedValue({ data: { variables: [] } });
        const createRepoVariable = jest.fn()
            .mockRejectedValueOnce(new Error('forbidden'))
            .mockResolvedValueOnce(undefined);
        const client = { rest: { actions: { listRepoVariables, createRepoVariable, updateRepoVariable: jest.fn() } } };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });

        const result = await repository.upsert('owner', 'repo', 'token', [
            { name: 'FIRST', value: 'one' },
            { name: 'SECOND', value: 'two' },
        ]);

        expect(result.created).toBe(1);
        expect(result.errors).toEqual(['Error configuring repository Variable FIRST: forbidden']);
    });

    it('lists repository secret names without requesting their values', async () => {
        const listRepoSecrets = jest.fn().mockResolvedValue({ data: { secrets: [{ name: 'PAT' }, { name: 'OPENAI_API_KEY' }] } });
        const client = { rest: { actions: { listRepoVariables: jest.fn(), createRepoVariable: jest.fn(), updateRepoVariable: jest.fn() }, secrets: {
            listRepoSecrets, getRepoPublicKey: jest.fn(), createOrUpdateRepoSecret: jest.fn(),
        } } };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });
        await expect(repository.list('owner', 'repo', 'token')).resolves.toEqual(['PAT', 'OPENAI_API_KEY']);
        expect(listRepoSecrets).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', per_page: 100 });
    });

    it('encrypts and upserts secret values using the repository public key', async () => {
        const listRepoSecrets = jest.fn().mockResolvedValue({ data: { secrets: [{ name: 'PAT' }] } });
        const createOrUpdateRepoSecret = jest.fn().mockResolvedValue(undefined);
        const client = { rest: { actions: { listRepoVariables: jest.fn(), createRepoVariable: jest.fn(), updateRepoVariable: jest.fn() }, secrets: {
            listRepoSecrets, getRepoPublicKey: jest.fn().mockResolvedValue({ data: { key_id: 'key-id', key: randomBytes(32).toString('base64') } }), createOrUpdateRepoSecret,
        } } };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });
        const result = await repository.upsertSecrets('owner', 'repo', 'token', [{ name: 'PAT', value: 'workflow-token' }, { name: 'OPENAI_API_KEY', value: 'api-key' }]);
        expect(result).toEqual({ created: 1, updated: 1, skipped: 0, errors: [] });
        expect(createOrUpdateRepoSecret).toHaveBeenCalledTimes(2);
        const payload = createOrUpdateRepoSecret.mock.calls[0][0];
        expect(payload).toMatchObject({ owner: 'owner', repo: 'repo', secret_name: 'PAT', key_id: 'key-id' });
        expect(payload.encrypted_value).not.toContain('workflow-token');
    });

    it('inspects repository and organization resources without exposing secret values', async () => {
        const listRepoOrganizationVariables = jest.fn().mockResolvedValue({ data: { variables: [{ name: 'ORG_VAR', value: 'org' }] } });
        const listRepoOrganizationSecrets = jest.fn().mockResolvedValue({ data: { secrets: [{ name: 'ORG_SECRET' }] } });
        const client = {
            rest: {
                repos: { get: jest.fn().mockResolvedValue({ data: { id: 42, visibility: 'private', owner: { type: 'Organization' } } }) },
                actions: {
                    listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [{ name: 'REPO_VAR', value: 'repo' }] } }),
                    createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
                    listRepoOrganizationVariables,
                },
                secrets: {
                    listRepoSecrets: jest.fn().mockResolvedValue({ data: { secrets: [{ name: 'REPO_SECRET' }] } }),
                    listRepoOrganizationSecrets,
                    getRepoPublicKey: jest.fn(), createOrUpdateRepoSecret: jest.fn(),
                },
            },
        };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });

        await expect(repository.inspect('owner', 'repo', 'token')).resolves.toEqual(expect.objectContaining({
            ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
            repositorySecrets: ['REPO_SECRET'], organizationSecrets: ['ORG_SECRET'],
            repositoryVariables: [{ name: 'REPO_VAR', value: 'repo' }],
            organizationVariables: [{ name: 'ORG_VAR', value: 'org' }],
            organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
        }));
        expect(listRepoOrganizationSecrets).toHaveBeenCalledWith({ repository_id: 42, per_page: 30 });
        expect(listRepoOrganizationVariables).toHaveBeenCalledWith({ repository_id: 42, per_page: 30 });
    });

    it('upserts selected organization secrets and variables with the repository access grant', async () => {
        const createOrUpdateOrgSecret = jest.fn().mockResolvedValue(undefined);
        const addSelectedRepoToOrgSecret = jest.fn().mockResolvedValue(undefined);
        const createOrUpdateOrgVariable = jest.fn().mockResolvedValue(undefined);
        const addSelectedRepoToOrgVariable = jest.fn().mockResolvedValue(undefined);
        const client = {
            rest: {
                actions: {
                    listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
                    createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
                    listOrgVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
                    createOrUpdateOrgVariable, addSelectedRepoToOrgVariable,
                },
                secrets: {
                    listRepoSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }),
                    getRepoPublicKey: jest.fn(), createOrUpdateRepoSecret: jest.fn(),
                    listOrgSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }),
                    getOrgPublicKey: jest.fn().mockResolvedValue({ data: { key_id: 'org-key', key: randomBytes(32).toString('base64') } }),
                    createOrUpdateOrgSecret, addSelectedRepoToOrgSecret,
                },
            },
        };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });
        const target = { scope: 'organization' as const, organizationVisibility: 'selected' as const, repositoryId: 42 };

        await expect(repository.upsertScopedSecrets('owner', 'repo', 'token', target, [{ name: 'PAT', value: 'secret' }]))
            .resolves.toMatchObject({ created: 1, errors: [] });
        await expect(repository.upsertScopedVariables('owner', 'repo', 'token', target, [{ name: 'MODE', value: 'strict' }]))
            .resolves.toEqual({ created: 1, updated: 0, errors: [] });
        expect(createOrUpdateOrgSecret).toHaveBeenCalledWith(expect.objectContaining({ org: 'owner', visibility: 'selected', selected_repository_ids: [42] }));
        expect(addSelectedRepoToOrgSecret).toHaveBeenCalledWith({ org: 'owner', secret_name: 'PAT', repository_id: 42 });
        expect(createOrUpdateOrgVariable).toHaveBeenCalledWith(expect.objectContaining({ org: 'owner', visibility: 'selected', selected_repository_ids: [42] }));
        expect(addSelectedRepoToOrgVariable).toHaveBeenCalledWith({ org: 'owner', name: 'MODE', repository_id: 42 });
    });

    it('reports unavailable organization inspection separately from personal repositories', async () => {
        const personalClient = {
            rest: {
                repos: { get: jest.fn().mockResolvedValue({ data: { id: 1, visibility: 'public', owner: { type: 'User' } } }) },
                actions: { listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }), createRepoVariable: jest.fn(), updateRepoVariable: jest.fn() },
                secrets: { listRepoSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }), getRepoPublicKey: jest.fn(), createOrUpdateRepoSecret: jest.fn() },
            },
        };
        const personal = new RepositoryVariablesRepository({ getClient: jest.fn(() => personalClient) });
        await expect(personal.inspect('owner', 'repo', 'token')).resolves.toEqual(expect.objectContaining({
            ownerType: 'User', organizationAccess: 'not_applicable',
            organizationSecretsAccess: 'not_applicable', organizationVariablesAccess: 'not_applicable',
        }));

        const deniedClient = {
            rest: {
                repos: { get: jest.fn().mockResolvedValue({ data: { id: 1, visibility: 'internal', owner: { type: 'Organization' } } }) },
                actions: {
                    listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }), createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
                    listRepoOrganizationVariables: jest.fn().mockRejectedValue(new Error('variables forbidden')),
                },
                secrets: {
                    listRepoSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }), getRepoPublicKey: jest.fn(), createOrUpdateRepoSecret: jest.fn(),
                    listRepoOrganizationSecrets: jest.fn().mockRejectedValue(new Error('secrets forbidden')),
                },
            },
        };
        const denied = new RepositoryVariablesRepository({ getClient: jest.fn(() => deniedClient) });
        await expect(denied.inspect('owner', 'repo', 'token')).resolves.toEqual(expect.objectContaining({
            ownerType: 'Organization', organizationAccess: 'unavailable',
            organizationSecretsAccess: 'unavailable', organizationVariablesAccess: 'unavailable',
        }));
    });

    it('uses the paginated client path and preserves existing organization visibility', async () => {
        const paginate = jest.fn().mockResolvedValue([{ name: 'EXISTING', visibility: 'selected' }]);
        const createOrUpdateOrgSecret = jest.fn().mockResolvedValue(undefined);
        const client = {
            paginate,
            rest: {
                actions: {
                    listRepoVariables: jest.fn(), createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
                    listOrgVariables: jest.fn().mockResolvedValue({ data: { variables: [{ name: 'EXISTING_VAR', visibility: 'selected' }] } }),
                    createOrUpdateOrgVariable: jest.fn().mockResolvedValue(undefined),
                },
                secrets: {
                    listRepoSecrets: jest.fn(), getRepoPublicKey: jest.fn(), createOrUpdateRepoSecret: jest.fn(),
                    listOrgSecrets: jest.fn(), getOrgPublicKey: jest.fn().mockResolvedValue({ data: { key_id: 'key', key: randomBytes(32).toString('base64') } }),
                    createOrUpdateOrgSecret,
                },
            },
        };
        const repository = new RepositoryVariablesRepository({ getClient: jest.fn(() => client) });
        const target = { scope: 'organization' as const, organizationVisibility: 'all' as const, repositoryId: 9 };

        await repository.upsertScopedSecrets('owner', 'repo', 'token', target, [{ name: 'EXISTING', value: 'new' }]);
        expect(paginate).toHaveBeenCalled();
        expect(createOrUpdateOrgSecret).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'selected' }));
    });
});
