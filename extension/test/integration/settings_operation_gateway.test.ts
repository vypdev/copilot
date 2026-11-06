import { expect, it, vi } from 'vitest';
import { operationGatewayFixture as fixture } from '../fixtures/operation_gateway.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { deferred } from '../fixtures/runtime.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import type { Sender } from '../../src/domain/protocol.ts';

it('current-operation metadata stays independent from off collection and performs no preferences/history/provider read', async () => {
    const f = await fixture(); expect(await f.read()).toEqual({ state: 'empty' }); const p = await f.preview();
    const reads = f.port.get.mock.calls.length; const native = vi.mocked(f.journals.execute).mock.calls.length;
    expect(await f.read()).toMatchObject({ state: 'current', operation: { stage: 'reviewed', retention: 'untracked' } });
    expect(f.port.get).toHaveBeenCalledTimes(reads); expect(f.journals.execute).toHaveBeenCalledTimes(native); expect(f.sessions.reader.read).not.toHaveBeenCalled();
    expect(await f.confirm(p)).toMatchObject({ state: 'committed' }); expect(await f.read()).toMatchObject({ operation: { stage: 'settled', fact: { observation: 'committed' } } });
    expect(f.documents.has('diagnostics')).toBe(false); expect(f.port.set).toHaveBeenCalledOnce();
});
it('the actual preference producer retains its admitted action and a single redacted history row after canonical completion', async () => {
    const f = await fixture('on'); const p = await f.preview(); await f.confirm(p); await f.history.writer.flush();
    const value = await f.read(); expect(decodeCurrentOperation(value)).toEqual(value);
    expect(value).toMatchObject({ operation: { family: 'settings', stage: 'settled', retention: 'stored', fact: { action: 'preferences', acknowledgement: 'accepted', observation: 'committed' } } });
    expect(f.documents.get('diagnostics')).toMatchObject({ entries: [{ fact: { kind: 'operation', action: 'preferences', phase: 'settled', acknowledgement: 'accepted', observation: 'committed' } }] });
    const serialized = JSON.stringify(f.documents.get('diagnostics')); expect(serialized).not.toContain(p.operationId); expect(serialized).not.toContain(f.owner.clientId);
});
it('private profile labels and identifiers remain current context and never enter retained diagnostics', async () => {
    const f = await fixture('on'); const p = await f.preview({ type: 'profile', change: { type: 'save', profile: { id: 'private-profile', name: '<img src=x>', scope: { kind: 'global' }, preferences: {} } } });
    expect(await f.read()).toMatchObject({ operation: { fact: { action: 'profile-create' }, target: { location: { route: 'profiles', detail: 'private-profile' }, label: '<img src=x>' } } });
    await f.confirm(p); await f.history.writer.flush(); const data = JSON.stringify(f.documents.get('diagnostics'));
    expect(data).not.toContain('private-profile'); expect(data).not.toContain('img'); expect(data).not.toContain('scope');
});
it('cancelling the real retained preview records cancellation without a preferences write', async () => {
    const f = await fixture('on'); const p = await f.preview(); await f.call({ ...f.owner, method: 'center.cancel', operationId: p.operationId, expectedRevision: p.revision });
    await f.history.writer.flush(); expect(f.port.set).not.toHaveBeenCalled(); expect(await f.read()).toMatchObject({ operation: { stage: 'cancelled', fact: { acknowledgement: 'not-submitted' } } });
});
it('a conflicting current revision is blocked and never represented as native submission', async () => {
    const f = await fixture('on'); const p = await f.preview(); await f.history.settings.update(s => ({ ...s, locale: 'es' }));
    expect(await f.confirm(p)).toEqual({ state: 'conflict' }); await f.history.writer.flush();
    expect(await f.read()).toMatchObject({ operation: { stage: 'blocked', fact: { phase: 'blocked', acknowledgement: 'not-submitted' } } });
});
it('unknown startup consent cannot be backfilled after native bootstrap learns active consent', async () => {
    const f = await fixture('cold'); const p = await f.preview(); expect(await f.read()).toMatchObject({ operation: { retention: 'untracked' } });
    await f.history.refresh(); expect(await f.confirm(p)).toMatchObject({ state: 'committed' }); await f.history.writer.flush();
    expect(f.documents.get('diagnostics')).toBeUndefined(); expect(await f.read()).toMatchObject({ operation: { stage: 'settled', retention: 'untracked' } });
});
it('a pending actual store attempt is observable while the primary confirmation waits', async () => {
    const f = await fixture(); const p = await f.preview(); const gate = deferred<void>(); const begun = deferred<void>(); const set = f.port.set.getMockImplementation()!;
    f.port.set.mockImplementationOnce(async (key, value) => { begun.resolve(); await gate.promise; await set(key, value); }); const result = f.confirm(p); await begun.promise;
    expect(await f.read()).toMatchObject({ operation: { stage: 'submitted', fact: { phase: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' } } });
    gate.resolve(); await result; expect(f.port.set).toHaveBeenCalledOnce();
});
it('lost acknowledgement and canonical completion remain independent in real native history', async () => {
    const f = await fixture('on'); const p = await f.preview(); const set = f.port.set.getMockImplementation()!;
    f.port.set.mockImplementationOnce(async (key, value) => { await set(key, value); throw new Error('private'); });
    expect(await f.confirm(p)).toMatchObject({ state: 'committed', acknowledgement: 'unknown' }); await f.history.writer.flush();
    expect(await f.read()).toMatchObject({ operation: { fact: { acknowledgement: 'unknown', observation: 'committed' } } }); expect(f.port.set).toHaveBeenCalledOnce();
});
it('a later ordinary native read reconciles the exact unknown result and original journal ticket without resubmission', async () => {
    const f = await fixture('on'); const p = await f.preview(); const set = f.port.set.getMockImplementation()!;
    f.port.set.mockImplementationOnce(async (key, value) => { await set(key, value); f.port.get.mockRejectedValueOnce(new Error('private')); });
    expect(await f.confirm(p)).toMatchObject({ state: 'unknown', acknowledgement: 'accepted' }); expect(await f.read()).toMatchObject({ operation: { stage: 'unknown' } });
    await f.call({ method: 'center.read', clientId: f.owner.clientId }); await f.history.writer.flush();
    expect(await f.read()).toMatchObject({ operation: { stage: 'settled', fact: { acknowledgement: 'accepted', observation: 'committed' } } });
    expect(await f.confirm(p)).toMatchObject({ state: 'committed', acknowledgement: 'accepted' }); expect(f.port.set).toHaveBeenCalledOnce();
});
it('native receipt identity alone cannot promote a different after-state to known completion', async () => {
    const f = await fixture(); const p = await f.preview(); const set = f.port.set.getMockImplementation()!;
    f.port.set.mockImplementationOnce(async (key, value) => { await set(key, value); f.port.get.mockRejectedValueOnce(new Error('private')); }); await f.confirm(p);
    const envelope = structuredClone(f.values.get(SETTINGS_KEY)) as { current: Record<string, unknown> }; envelope.current.theme = 'dark'; f.values.set(SETTINGS_KEY, envelope);
    await f.call({ method: 'center.read', clientId: f.owner.clientId }); expect(await f.read()).toMatchObject({ operation: { stage: 'unknown' } }); expect(f.port.set).toHaveBeenCalledOnce();
});
it('another native observer cannot see or reconcile the editor’s private current operation', async () => {
    const f = await fixture(); const p = await f.preview(); const sender = { ...CENTER_SENDER, documentId: 'other-document', tab: { id: 2, incognito: false } }; const other = await f.open(sender);
    expect(await f.call({ method: 'center.operation.read', clientId: other.clientId }, sender)).toEqual({ state: 'empty' });
    expect(await f.call({ method: 'center.operation.read', clientId: f.owner.clientId }, sender)).toEqual({ state: 'stale' });
    await f.confirm(p); expect(f.port.set).toHaveBeenCalledOnce();
});
it.each(['document', 'tab', 'frame', 'origin'] as const)('a mismatched %s cannot read native current private detail', async boundary => {
    const f = await fixture(); await f.preview(); let sender: Sender = CENTER_SENDER;
    if (boundary === 'document') sender = { ...sender, documentId: 'replaced' };
    if (boundary === 'tab') sender = { ...sender, tab: { id: 3, incognito: false } };
    if (boundary === 'frame') sender = { ...sender, frameId: 1 };
    if (boundary === 'origin') sender = { ...sender, url: 'https://github.com/vypdev/copilot' };
    const response = await f.call({ method: 'center.operation.read', clientId: f.owner.clientId }, sender);
    expect(JSON.stringify(response)).not.toContain('location'); expect(f.port.set).not.toHaveBeenCalled();
});
it('credential movement retires the private target and cannot be reversed by reading an old result', async () => {
    const f = await fixture(); const p = await f.preview(); await f.sessions.service.revoke();
    expect(await f.confirm(p)).toEqual({ state: 'stale' }); expect(await f.read()).toMatchObject({ operation: { target: null, sourceCurrent: false } });
});
it('taking control in another native document forgets the old current entry without creating a replacement from preferences', async () => {
    const f = await fixture(); await f.preview(); const sender = { ...CENTER_SENDER, documentId: 'other-document', tab: { id: 2, incognito: false } }; const other = await f.open(sender);
    expect(await f.call({ method: 'center.claim', clientId: other.clientId, controllerEpoch: other.controllerEpoch }, sender)).toMatchObject({ state: 'ready', role: 'editor' });
    expect(await f.read()).toEqual({ state: 'empty' });
});
it('metadata notifications stay center-only and do not query GitHub tabs or call the provider', async () => {
    const f = await fixture(); await f.confirm(await f.preview());
    expect(vi.mocked(f.browser.api.runtime.sendMessage).mock.calls.every(([v]) => (v as { method: string }).method === 'center.operation.invalidated')).toBe(true);
    expect(f.browser.api.tabs.query).not.toHaveBeenCalled(); expect(f.sessions.reader.read).not.toHaveBeenCalled();
});
it('a previously stored observation can complete on its exact row after the preference save stops collection', async () => {
    const f = await fixture('on'); const p = await f.preview({ type: 'center', values: { diagnostics: false } }); await f.history.writer.flush();
    expect(await f.confirm(p)).toMatchObject({ state: 'committed' }); await f.history.writer.flush();
    expect(f.history.coordinator.state('diagnostics').collecting).toBe(false);
    expect(f.documents.get('diagnostics')).toMatchObject({ entries: [{ fact: { action: 'center-preferences', phase: 'settled', observation: 'committed' } }] });
    expect(await f.read()).toMatchObject({ operation: { stage: 'settled', retention: 'stored' } });
});
it('a failed native current-operation notification cannot reject or repeat the actual preference save', async () => {
    const f = await fixture(); vi.mocked(f.browser.api.runtime.sendMessage).mockRejectedValue(new Error('private notification failure'));
    const p = await f.preview(); expect(await f.confirm(p)).toMatchObject({ state: 'committed' }); await Promise.resolve();
    expect(await f.read()).toMatchObject({ operation: { stage: 'settled', fact: { observation: 'committed' } } }); expect(f.port.set).toHaveBeenCalledOnce();
});
