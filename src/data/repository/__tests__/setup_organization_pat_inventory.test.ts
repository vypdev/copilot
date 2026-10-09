import { GithubActionsResourceInspector } from '../github/github_actions_resource_inspector';
import { validateSetupStorageAgainstRemote } from '../../../application/policies/setup_configuration_storage_policy';
import { createDefaultSetupConfiguration } from '../../../application/policies/setup_configuration_defaults';
import { sameSetupRemoteFacts } from '../../../application/policies/setup_remote_facts_policy';

function fixture() {
    const client = { rest: { repos: { get: jest.fn().mockResolvedValue({ data: { owner: { type: 'Organization' }, visibility: 'private', id: 7 } }) },
        actions: { listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
            createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
            listRepoSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }),
            listRepoOrganizationSecrets: jest.fn().mockResolvedValue({ data: { secrets: [] } }),
            listRepoOrganizationVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
            listOrgSecrets: jest.fn().mockResolvedValue({ data: { secrets: [{ name: 'PAT' }] } }),
        } } };
    return { client, inspector: new GithubActionsResourceInspector({ getClient: () => client }) };
}

describe('organization PAT namespace metadata', () => {
    test('detects PAT outside the effective repository inventory without revealing any value', async () => {
        const f = fixture();
        const result = await f.inspector.inspect('owner', 'repo', 'setup-fixture');
        expect(result.organizationSecrets).toEqual([]);
        expect(result.organizationWorkflowPat).toBe('present');
        expect(f.client.rest.actions.listOrgSecrets).toHaveBeenCalledWith({ org: 'owner', per_page: 100 });
        expect(JSON.stringify(result)).not.toContain('setup-fixture');
    });
    test('reports absence only after a successful organization namespace read', async () => {
        const f = fixture(); f.client.rest.actions.listOrgSecrets.mockResolvedValue({ data: { secrets: [] } });
        expect((await f.inspector.inspect('owner', 'repo', 'setup-fixture')).organizationWorkflowPat).toBe('absent');
    });
    test.each(['denied', 'malformed', 'missing-port'] as const)('keeps %s namespace reads unavailable and blocks an organization PAT target', async failure => {
        const f = fixture();
        if (failure === 'denied') f.client.rest.actions.listOrgSecrets.mockRejectedValue(new Error('private GitHub detail'));
        if (failure === 'malformed') f.client.rest.actions.listOrgSecrets.mockResolvedValue({ data: {} });
        if (failure === 'missing-port') delete (f.client.rest.actions as { listOrgSecrets?: unknown }).listOrgSecrets;
        const result = await f.inspector.inspect('owner', 'repo', 'setup-fixture');
        expect(result.organizationWorkflowPat).toBe('unavailable');
        const config = createDefaultSetupConfiguration(); config.storage.secrets.defaultScope = 'organization';
        expect(validateSetupStorageAgainstRemote(config, result)).toContainEqual(expect.stringContaining('Organization PAT Secret inventory is unavailable'));
        config.storage.secrets.defaultScope = 'repository';
        expect(validateSetupStorageAgainstRemote(config, result)).toEqual([]);
        expect(JSON.stringify(result)).not.toContain('private GitHub detail');
    });
    test('does not query an organization namespace for a personal repository', async () => {
        const f = fixture(); f.client.rest.repos.get.mockResolvedValue({ data: { owner: { type: 'User' }, visibility: 'private', id: 7 } });
        expect((await f.inspector.inspect('owner', 'repo', 'setup-fixture')).organizationWorkflowPat).toBeUndefined();
        expect(f.client.rest.actions.listOrgSecrets).not.toHaveBeenCalled();
    });
    test('detects namespace changes before web Apply even when inherited names are unchanged', async () => {
        const f = fixture(); const approved = await f.inspector.inspect('owner', 'repo', 'setup-fixture');
        expect(sameSetupRemoteFacts(approved, { ...approved, organizationWorkflowPat: 'absent' })).toBe(false);
    });
});
