import { ResolveSetupWorkflowPatConflictUseCase } from '../resolve_setup_workflow_pat_conflict_use_case';
import { SetupWizardUseCase } from '../setup_wizard_use_case';
import { SetupInteractionCancelledError } from '../../../errors/setup_interaction_cancelled_error';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { createSetupReviewState } from '../../../policies/setup_questionnaire_policy';
import { canKeepExistingSetupResource, findSetupOrganizationShadows, requiresSetupOrganizationInventory,
    resolveSetupResourceTarget, setupWorkflowPatStorageNotice, shouldUpsertSetupResource } from '../../../policies/setup_configuration_storage_policy';
import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../../domain/setup';

const remote: SetupRemoteConfiguration = {
    ownerType: 'Organization', repositoryId: 7, repositoryVisibility: 'private',
    repositorySecrets: ['PAT'], repositorySecretsAccess: 'available', organizationSecrets: ['PAT'],
    organizationSecretsAccess: 'available', repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: [], organizationVariablesAccess: 'available', organizationAccess: 'available',
};
const cleared = { ...remote, repositorySecrets: [] };
const next = () => new Promise<void>(resolve => setImmediate(resolve));
function configuration(): SetupConfiguration {
    const value = createDefaultSetupConfiguration();
    value.pullRequestApproval = { ...value.pullRequestApproval, mode: 'off' };
    value.storage.secrets.defaultScope = 'organization';
    value.createInitialTag = false;
    return value;
}
function fixture() {
    const prompt = { resolveWorkflowPatConflict: jest.fn() };
    const reader = { inspect: jest.fn() };
    const request = { owner: 'owner', repository: 'repo', token: 'setup-fixture', configuration: configuration(), remote };
    return { prompt, reader, request, useCase: new ResolveSetupWorkflowPatConflictUseCase(prompt, reader) };
}

describe('bot PAT storage exception', () => {
    test('uses the selected repository scope instead of preserving an inherited organization PAT', () => {
        const config = configuration(); config.storage.secrets.defaultScope = 'repository';
        expect(resolveSetupResourceTarget(config, 'secret', 'PAT', cleared).scope).toBe('repository');
        expect(canKeepExistingSetupResource(config.storage.secrets, 'PAT', 'organization')).toBe(false);
        expect(shouldUpsertSetupResource(config, 'secret', 'PAT', cleared)).toBe(true);
    });
    test('detects a repository PAT shadow with preservation enabled and organization selected', () => {
        const config = configuration();
        expect(resolveSetupResourceTarget(config, 'secret', 'PAT', remote).scope).toBe('organization');
        expect(findSetupOrganizationShadows(config.storage.secrets, 'secret', ['PAT'], remote)).toEqual(['PAT']);
    });
    test('honors a PAT repository override while preserving the organization default', () => {
        const config = configuration(); config.storage.secrets.overrides.PAT = 'repository';
        expect(resolveSetupResourceTarget(config, 'secret', 'PAT', remote).scope).toBe('repository');
        expect(findSetupOrganizationShadows(config.storage.secrets, 'secret', ['PAT'], remote)).toEqual([]);
    });
    test('preserves other inherited Secrets and Variables, including a Variable named PAT', () => {
        const config = configuration(); config.storage.secrets.defaultScope = 'repository';
        const inherited = { ...cleared, organizationSecrets: ['OPENAI_API_KEY'], organizationVariables: [{ name: 'PAT', value: 'non-secret' }] };
        expect(resolveSetupResourceTarget(config, 'secret', 'OPENAI_API_KEY', inherited).scope).toBe('organization');
        expect(canKeepExistingSetupResource(config.storage.secrets, 'OPENAI_API_KEY', 'organization')).toBe(true);
        expect(resolveSetupResourceTarget(config, 'variable', 'PAT', inherited).scope).toBe('organization');
    });
    test('does not need organization inventory to replace a repository-targeted PAT', () => {
        const config = configuration(); config.storage.secrets.defaultScope = 'repository';
        expect(requiresSetupOrganizationInventory(config.storage.secrets, ['PAT'])).toBe(false);
        expect(requiresSetupOrganizationInventory(config.storage.secrets, ['PAT'], [], 'variable')).toBe(true);
    });
    test('requires organization inventory for an organization PAT even with an existing repository PAT', () => {
        expect(requiresSetupOrganizationInventory(configuration().storage.secrets, ['PAT'], ['PAT'])).toBe(true);
    });
    test.each(['repository', 'organization'] as const)('discloses replacement only when PAT exists in the selected %s scope', scope => {
        const policy = { ...configuration().storage.secrets, defaultScope: scope };
        const destination = scope === 'repository' ? 'owner/repo' : 'owner';
        expect(setupWorkflowPatStorageNotice('owner', 'repo', policy, ['PAT'], ['PAT']))
            .toEqual({ scope, destination, replacesExisting: true });
        expect(setupWorkflowPatStorageNotice('owner', 'repo', policy,
            scope === 'repository' ? [] : ['PAT'], scope === 'organization' ? [] : ['PAT']))
            .toEqual({ scope, destination, replacesExisting: false });
    });
});

describe('explicit bot PAT conflict recovery', () => {
    test.each(['disabled', 'repository', 'absent', 'unknown'] as const)('leaves %s cases to their existing setup gates without prompting or querying', async scenario => {
        const f = fixture();
        if (scenario === 'disabled') f.request.configuration.manageRepositorySecrets = false;
        if (scenario === 'repository') f.request.configuration.storage.secrets.defaultScope = 'repository';
        if (scenario === 'absent') f.request.remote = cleared;
        if (scenario === 'unknown') f.request.remote = { ...remote, repositorySecretsAccess: 'unknown' };
        const result = await f.useCase.execute(f.request);
        expect(result.remote).toBe(f.request.remote);
        expect(f.prompt.resolveWorkflowPatConflict).not.toHaveBeenCalled();
        expect(f.reader.inspect).not.toHaveBeenCalled();
    });
    test('waits for the user before any fresh inventory read', async () => {
        const f = fixture(); let decide!: (decision: 'repository') => void;
        f.prompt.resolveWorkflowPatConflict.mockImplementation(() => new Promise(resolve => { decide = resolve; }));
        const pending = f.useCase.execute(f.request); await next();
        expect(f.reader.inspect).not.toHaveBeenCalled();
        expect(f.prompt.resolveWorkflowPatConflict).toHaveBeenCalledWith('owner/repo', 'present');
        decide('repository'); await pending;
    });
    test('accepts removal only from a fresh, available GitHub inventory and retains every other answer', async () => {
        const f = fixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValue('recheck');
        f.reader.inspect.mockResolvedValue({ ...cleared, organizationSecrets: ['PAT', 'CODEX_API_KEY'] });
        const result = await f.useCase.execute(f.request);
        expect(f.reader.inspect).toHaveBeenCalledWith('owner', 'repo', 'setup-fixture');
        expect(result.remote.organizationSecrets).toContain('CODEX_API_KEY');
        expect(result.configuration).toEqual(f.request.configuration);
        expect(result.configuration).not.toBe(f.request.configuration);
    });
    test('shows the conflict again when the claimed deletion is not confirmed', async () => {
        const f = fixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValueOnce('recheck').mockResolvedValueOnce('recheck');
        f.reader.inspect.mockResolvedValueOnce(remote).mockResolvedValueOnce(cleared);
        const result = await f.useCase.execute(f.request);
        expect(f.prompt.resolveWorkflowPatConflict.mock.calls).toEqual([['owner/repo', 'present'], ['owner/repo', 'present']]);
        expect(result.remote.repositorySecrets).toEqual([]);
    });
    test.each(['unavailable', 'unknown'] as const)('never treats %s inventory with an empty list as confirmed removal', async access => {
        const f = fixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValueOnce('recheck').mockResolvedValueOnce('recheck');
        f.reader.inspect.mockResolvedValueOnce({ ...cleared, repositorySecretsAccess: access }).mockResolvedValueOnce(cleared);
        await f.useCase.execute(f.request);
        expect(f.prompt.resolveWorkflowPatConflict.mock.calls).toEqual([['owner/repo', 'present'], ['owner/repo', 'unavailable']]);
        expect(f.reader.inspect).toHaveBeenCalledTimes(2);
    });
    test('retains safe state after a failed read and allows an explicit repository scope choice', async () => {
        const f = fixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValueOnce('recheck').mockResolvedValueOnce('repository');
        f.reader.inspect.mockRejectedValue(new Error('private provider detail'));
        const result = await f.useCase.execute(f.request);
        expect(f.prompt.resolveWorkflowPatConflict).toHaveBeenLastCalledWith('owner/repo', 'unavailable');
        expect(result.remote).toBe(remote);
        expect(result.configuration.storage.secrets.overrides.PAT).toBe('repository');
    });
    test('changes only the PAT scope, isolating input objects and retaining preservation and other overrides', async () => {
        const f = fixture(); f.request.configuration.storage.secrets.overrides.CODEX_API_KEY = 'organization';
        f.prompt.resolveWorkflowPatConflict.mockResolvedValue('repository');
        const result = await f.useCase.execute(f.request);
        expect(result.configuration).toEqual({ ...f.request.configuration, storage: { ...f.request.configuration.storage,
            secrets: { ...f.request.configuration.storage.secrets, overrides: { CODEX_API_KEY: 'organization', PAT: 'repository' } } } });
        expect(f.request.configuration.storage.secrets.overrides.PAT).toBeUndefined();
        expect(f.reader.inspect).not.toHaveBeenCalled();
    });
    test('cancels without reading or deleting a Secret', async () => {
        const f = fixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValue('cancel');
        await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
        expect(f.reader.inspect).not.toHaveBeenCalled();
    });
});

describe('wizard conflict recovery before plan approval', () => {
    function wizardFixture() {
        const f = fixture();
        const deps = {
            collector: { collect: jest.fn(async state => createSetupReviewState(state.draft)) },
            planPresenter: { present: jest.fn() }, confirmation: { confirm: jest.fn().mockResolvedValue({ kind: 'approved' }) },
            finalPermissionAudit: { audit: jest.fn().mockResolvedValue({ status: 'accepted' }) },
            remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) }, workflowPatConflict: f.useCase,
        };
        const request = { mode: 'interactive' as const, overrides: configuration(),
            remoteTarget: { owner: 'owner', repository: 'repo', token: 'setup-fixture' } };
        return { ...f, deps, request };
    }
    test('rebuilds the plan with refreshed inventory after manual removal without repeating the questionnaire', async () => {
        const f = wizardFixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValue('recheck'); f.reader.inspect.mockResolvedValue(cleared);
        const result = await new SetupWizardUseCase(f.deps).execute(f.request);
        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('Expected completed plan');
        expect(result.remoteConfiguration?.repositorySecrets).toEqual([]);
        expect(result.plan.workflowPatStorage).toEqual({ scope: 'organization', destination: 'owner', replacesExisting: true });
        expect(result.configuration.createInitialTag).toBe(false);
        expect(f.deps.collector.collect).toHaveBeenCalledTimes(1);
        expect(f.deps.finalPermissionAudit.audit).toHaveBeenCalledWith(result.configuration, result.remoteConfiguration);
    });
    test('shows and audits the changed PAT target in a newly approved plan', async () => {
        const f = wizardFixture(); f.prompt.resolveWorkflowPatConflict.mockResolvedValue('repository');
        const result = await new SetupWizardUseCase(f.deps).execute(f.request);
        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('Expected completed plan');
        expect(result.plan.workflowPatStorage).toEqual({ scope: 'repository', destination: 'owner/repo', replacesExisting: true });
        expect(result.plan.configuration.storage.secrets.overrides.PAT).toBe('repository');
        expect(f.deps.confirmation.confirm).toHaveBeenCalledWith(result.plan);
        expect(f.deps.finalPermissionAudit.audit).toHaveBeenCalledWith(result.configuration, result.remoteConfiguration);
    });
    test('keeps unattended conflicts blocked without offering interactive recovery or starting an audit', async () => {
        const f = wizardFixture();
        const result = await new SetupWizardUseCase(f.deps).execute({ ...f.request, mode: 'non-interactive' });
        expect(result).toMatchObject({ status: 'blocked', reason: 'remote-storage-unavailable' });
        expect(f.prompt.resolveWorkflowPatConflict).not.toHaveBeenCalled();
        expect(f.deps.confirmation.confirm).not.toHaveBeenCalled();
        expect(f.deps.finalPermissionAudit.audit).not.toHaveBeenCalled();
    });
});
