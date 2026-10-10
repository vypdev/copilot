import { SetupCredentialsUseCase } from '../setup_credentials_use_case';
import type { SetupRemoteConfiguration, SetupResourceScope } from '../../../../domain/setup';

const remote: SetupRemoteConfiguration = {
    ownerType: 'Organization', repositoryVisibility: 'private', repositoryId: 7,
    repositorySecrets: ['PAT'], repositorySecretsAccess: 'available', organizationSecrets: [], organizationSecretsAccess: 'available',
    organizationWorkflowPat: 'present', repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: [], organizationVariablesAccess: 'available', organizationAccess: 'available',
};
const pat = { name: 'PAT', kind: 'workflowPat' as const, description: 'Bot' };
const permission = { id: 'contents', role: 'workflow' as const, scope: 'repository' as const, permission: 'Contents',
    level: 'write' as const, applicability: 'required' as const, reason: 'Write', probe: 'contents' as const };
function fixture(scope: SetupResourceScope = 'repository') {
    const prompt = {
        requestSetupPat: jest.fn(), explainCredentialSeparation: jest.fn(), showCredentialChecks: jest.fn(),
        requestWorkflowPat: jest.fn().mockResolvedValue({ name: 'PAT', value: 'replacement-fixture' }),
        requestApiKey: jest.fn(), chooseExistingCredential: jest.fn().mockResolvedValue('keep'),
    };
    const health = { validateExisting: jest.fn().mockResolvedValue([{ name: 'CODEX_API_KEY', status: 'valid', message: 'Healthy' }]) };
    const audit = { inspect: jest.fn().mockResolvedValue({ ready: true, identityStatus: 'valid', checks: [] }) };
    const useCase = new SetupCredentialsUseCase(prompt,
        { validateSetupPat: jest.fn().mockResolvedValue({ status: 'valid', message: 'OK' }), validateCredential: jest.fn() },
        { list: jest.fn() }, health, audit);
    const request = { owner: 'owner', repository: 'repo', setupToken: 'setup-fixture', requirements: [pat], manageSecrets: true,
        secretStoragePolicy: { defaultScope: scope, preserveExisting: true, overrides: {}, organizationVisibility: 'selected' as const },
        workflowTokenPermissions: [permission], remoteConfiguration: scope === 'repository' ? remote : { ...remote, repositorySecrets: [] },
    };
    return { prompt, health, audit, useCase, request };
}

describe('mandatory bot PAT rotation', () => {
    test('audits a supplied PAT without an unaudited keep choice or stored-PAT health dispatch', async () => {
        const f = fixture(); const result = await f.useCase.collect(f.request);
        expect(f.prompt.chooseExistingCredential).not.toHaveBeenCalled();
        expect(f.health.validateExisting).not.toHaveBeenCalled();
        expect(f.prompt.requestWorkflowPat).toHaveBeenCalledWith(pat, expect.objectContaining({ status: 'unverifiable' }),
            { scope: 'repository', destination: 'owner/repo', replacesExisting: true });
        expect(f.audit.inspect).toHaveBeenCalledWith(expect.objectContaining({ token: 'replacement-fixture', requirements: [permission] }));
        expect(result.collection.workflowPat?.value).toBe('replacement-fixture');
    });
    test('warns about an organization PAT even when it is not currently shared with the repository', async () => {
        const f = fixture('organization'); await f.useCase.collect(f.request);
        expect(f.prompt.requestWorkflowPat).toHaveBeenCalledWith(pat, undefined,
            { scope: 'organization', destination: 'owner', replacesExisting: true });
        expect(f.health.validateExisting).not.toHaveBeenCalled();
    });
    test.each(['missing', 'unverifiable', 'identity'] as const)('does not return a replacement collection after a %s audit result', async failure => {
        const f = fixture();
        f.audit.inspect.mockResolvedValue({ ready: failure === 'identity', identityStatus: failure === 'identity' ? 'invalid' : 'valid', checks: [] });
        await expect(f.useCase.collect(f.request)).rejects.toThrow('PAT validation failed');
        expect(f.prompt.chooseExistingCredential).not.toHaveBeenCalled();
    });
    test('continues preserving another healthy Secret while always replacing PAT', async () => {
        const f = fixture();
        const result = await f.useCase.collect({ ...f.request,
            requirements: [pat, { name: 'CODEX_API_KEY', kind: 'apiKey', description: 'API' }],
            remoteConfiguration: { ...remote, repositorySecrets: ['PAT', 'CODEX_API_KEY'] } });
        expect(f.health.validateExisting).toHaveBeenCalledWith('owner', 'repo', 'setup-fixture', 'master',
            [{ name: 'CODEX_API_KEY', kind: 'apiKey', description: 'API' }]);
        expect(f.prompt.chooseExistingCredential).toHaveBeenCalledTimes(1);
        expect(f.prompt.chooseExistingCredential).toHaveBeenCalledWith(expect.objectContaining({ name: 'CODEX_API_KEY' }), expect.anything());
        expect(f.prompt.requestApiKey).not.toHaveBeenCalled();
        expect(result.collection.apiKeys).toEqual([]);
    });
    test('rejects an unavailable organization namespace instead of claiming that PAT is absent', async () => {
        const f = fixture('organization');
        await expect(f.useCase.collect({ ...f.request, remoteConfiguration: { ...f.request.remoteConfiguration,
            organizationWorkflowPat: 'unavailable' } })).rejects.toThrow('Organization PAT Secret inventory is unavailable');
        expect(f.prompt.requestWorkflowPat).not.toHaveBeenCalled();
        expect(f.audit.inspect).not.toHaveBeenCalled();
    });
});
