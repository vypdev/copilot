import { randomBytes } from 'node:crypto';
import type { SetupResourceTarget } from '../../../domain/setup';
import { RepositorySecretsCommandRepository, RepositoryVariablesCommandRepository } from '../repository_variables_repository';

function fixture(kind: 'Secret' | 'Variable') {
    const write = jest.fn().mockResolvedValue({});
    const grant = jest.fn().mockResolvedValue({});
    const actions = {
        listRepoVariables: jest.fn(), createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
        listOrgSecrets: jest.fn().mockResolvedValue({ data: { secrets: [{ name: 'EXISTING', visibility: 'selected' }] } }),
        getOrgPublicKey: jest.fn().mockResolvedValue({ data: { key_id: 'key', key: randomBytes(32).toString('base64') } }),
        createOrUpdateOrgSecret: write, addSelectedRepoToOrgSecret: grant,
        listOrgVariables: jest.fn().mockResolvedValue({ data: { variables: [{ name: 'EXISTING', visibility: 'selected' }] } }),
        createOrgVariable: write, updateOrgVariable: write, addSelectedRepoToOrgVariable: grant,
    };
    const provider = { getClient: () => ({ rest: { actions } }) };
    const run = (target: SetupResourceTarget, name = 'EXISTING') => kind === 'Secret'
        ? new RepositorySecretsCommandRepository(provider).upsertScopedSecrets('owner', 'repo', 'fixture', target, [{ name, value: 'fixture' }])
        : new RepositoryVariablesCommandRepository(provider).upsertScopedVariables('owner', 'repo', 'fixture', target, [{ name, value: 'fixture' }]);
    const removeGrant = () => Reflect.deleteProperty(actions, kind === 'Secret' ? 'addSelectedRepoToOrgSecret' : 'addSelectedRepoToOrgVariable');
    return { run, write, grant, removeGrant };
}

describe.each(['Secret', 'Variable'] as const)('selected organization %s repository access', kind => {
    const selected: SetupResourceTarget = { scope: 'organization', organizationVisibility: 'selected', repositoryId: 42 };
    const all: SetupResourceTarget = { ...selected, organizationVisibility: 'all' };
    const error = { created: 0, updated: 0, errors: [`Unable to configure organization ${kind} EXISTING.`] };

    it('does not write an existing selected resource when the grant endpoint is absent', async () => {
        const { run, write, removeGrant } = fixture(kind);
        removeGrant();
        await expect(run(all)).resolves.toMatchObject(error);
        expect(write).not.toHaveBeenCalled();
    });

    it('requires repository identity for preserved selected visibility even when the requested visibility is all', async () => {
        const { run, write, grant } = fixture(kind);
        await expect(run({ scope: 'organization', organizationVisibility: 'all' })).resolves.toMatchObject(error);
        expect(write).not.toHaveBeenCalled();
        expect(grant).not.toHaveBeenCalled();
    });

    it('requires only the capabilities needed for selected resource creation', async () => {
        const { run, write, removeGrant } = fixture(kind);
        removeGrant();
        if (kind === 'Secret') {
            await expect(run(selected, 'NEW')).resolves.toMatchObject({
                created: 0, updated: 0, errors: [`Unable to configure organization ${kind} NEW.`],
            });
            expect(write).not.toHaveBeenCalled();
        } else {
            await expect(run(selected, 'NEW')).resolves.toMatchObject({ created: 1, updated: 0, errors: [] });
            expect(write).toHaveBeenCalledWith({ org: 'owner', name: 'NEW', value: 'fixture', visibility: 'selected', selected_repository_ids: [42] });
        }
    });

    it('does not count an updated value as configured when granting access fails', async () => {
        const { run, write, grant } = fixture(kind);
        grant.mockRejectedValue(new Error('fixture grant denied'));
        await expect(run(all)).resolves.toMatchObject(error);
        expect(write).toHaveBeenCalledTimes(1);
        expect(grant).toHaveBeenCalledTimes(1);
    });

    it('allows private visibility without a selected-repository endpoint or identity', async () => {
        const { run, write, removeGrant } = fixture(kind);
        removeGrant();
        await expect(run({ scope: 'organization', organizationVisibility: 'private' }, 'NEW'))
            .resolves.toMatchObject({ created: 1, updated: 0, errors: [] });
        expect(write).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
    });
});
