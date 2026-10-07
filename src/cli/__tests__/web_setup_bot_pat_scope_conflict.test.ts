import { WebSetupBridge } from '../web_setup_bridge';
import { WebSetupCredentialPrompt } from '../web_setup_adapters';
import { ResolveSetupWorkflowPatConflictUseCase } from '../../application/usecases/setup/resolve_setup_workflow_pat_conflict_use_case';
import { SetupInteractionCancelledError } from '../../application/errors/setup_interaction_cancelled_error';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import type { SetupRemoteConfiguration } from '../../domain/setup';

const next = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
    const bridge = new WebSetupBridge('owner/repo');
    const config = createDefaultSetupConfiguration(); config.storage.secrets.defaultScope = 'organization';
    const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryVisibility: 'private',
        repositorySecrets: ['PAT'], repositorySecretsAccess: 'available', organizationSecrets: ['PAT'], organizationSecretsAccess: 'available',
        repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [], organizationVariablesAccess: 'available', organizationAccess: 'available' };
    const reader = { inspect: jest.fn().mockResolvedValueOnce(remote).mockResolvedValue({ ...remote, repositorySecrets: [] }) };
    const useCase = new ResolveSetupWorkflowPatConflictUseCase(new WebSetupCredentialPrompt(bridge), reader);
    const answer = async (value: string) => { expect(bridge.answer(bridge.snapshot().promptRevision!, value)).toBe(true); await next(); };
    return { bridge, reader, answer, run: () => useCase.execute({ owner: 'owner', repository: 'repo', token: 'setup-fixture', configuration: config, remote }) };
}

describe('web PAT scope conflict handoff', () => {
    test('requires fresh evidence after each button click, rejects stale clicks and retains the session', async () => {
        const f = fixture(); const views: string[] = []; f.bridge.subscribe(view => views.push(JSON.stringify(view)));
        const pending = f.run(); await next();
        const revision = f.bridge.snapshot().promptRevision!;
        expect(f.bridge.snapshot().prompt).toMatchObject({ copyId: 'botPat.scopeConflict', copyValues: { repository: 'owner/repo' } });
        expect(f.reader.inspect).not.toHaveBeenCalled();
        await f.answer('I have deleted the repository PAT — check again');
        expect(f.bridge.snapshot().outcome).toBeUndefined();
        expect(f.bridge.snapshot().prompt).toMatchObject({ copyId: 'botPat.scopeConflict' });
        expect(f.bridge.answer(revision, 'I have deleted the repository PAT — check again')).toBe(false);
        await f.answer('I have deleted the repository PAT — check again');
        await expect(pending).resolves.toMatchObject({ remote: { repositorySecrets: [] } });
        expect(f.reader.inspect).toHaveBeenCalledTimes(2);
        expect(views.join('\n')).not.toContain('setup-fixture');
    });
    test.each(['stop', 'close'] as const)('cancels the unresolved conflict on %s without querying or deleting', async action => {
        const f = fixture(); const pending = f.run(); const rejected = expect(pending).rejects.toBeInstanceOf(SetupInteractionCancelledError);
        await next(); if (action === 'stop') await f.answer('Stop setup'); else expect(f.bridge.cancel()).toBe(true);
        await rejected; expect(f.reader.inspect).not.toHaveBeenCalled();
    });
});
