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
});
