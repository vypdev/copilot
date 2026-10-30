import { expect, it, vi } from 'vitest';
import { sessionGatewayFixture as fixture } from '../fixtures/session_gateway.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { deferred } from '../fixtures/runtime.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

it('the actual native composition records all five session effects including the repository preference, without private history', async () => {
    const f = await fixture(true); expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready' }); await f.history.writer.flush(); const reply = await f.read();
    expect(decodeCurrentOperation(reply)).toEqual(reply); expect(reply).toMatchObject({ operation: { family: 'sessions', stage: 'settled', sourceCurrent: true, retention: 'stored', target: { label: 'Work' } } });
    expect(f.rows()).toHaveLength(1); const fact = f.rows()[0].fact; expect(fact.kind).toBe('session-operation');
    if (fact.kind !== 'session-operation') throw new Error('missing-session-fact');
    expect(fact.effects.map(e => e.effect)).toEqual(['retire-active', 'retire-active', 'save-active', 'save-repository-preference', 'save-vault']);
    for (const value of [CONNECTION_INPUT.secret, 'Work', 'octo/example', 'session-1', f.owner.clientId]) expect(JSON.stringify(f.rows())).not.toContain(value);
});
it.each([true, false])('current session metadata works with collection off and history owner installed=%s without metadata I/O', async installed => {
    const f = await fixture(false, installed); expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready' }); const local = f.settingsPort.get.mock.calls.length; const protectedReads = f.protectedPort.get.mock.calls.length; const provider = vi.mocked(f.sessions.reader.read).mock.calls.length;
    expect(await f.read()).toMatchObject({ operation: { family: 'sessions', stage: 'settled', retention: 'untracked' } });
    expect(f.settingsPort.get).toHaveBeenCalledTimes(local); expect(f.protectedPort.get).toHaveBeenCalledTimes(protectedReads); expect(f.sessions.reader.read).toHaveBeenCalledTimes(provider); expect(f.rows()).toHaveLength(0);
});
it.each(['unapplied', 'lost-ack', 'unreadable'] as const)('repository preference %s has its own phase and cannot fabricate complete session persistence', async mode => {
    const f = await fixture(true); const set = f.settingsPort.set.getMockImplementation()!;
    f.settingsPort.set.mockImplementation(async (key, value) => {
        if (key !== SETTINGS_KEY) return set(key, value); if (mode === 'unapplied') return; await set(key, value);
        if (mode === 'lost-ack') throw new Error('private'); f.settingsPort.get.mockRejectedValueOnce(new Error('private'));
    });
    expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: mode === 'lost-ack' ? 'ready' : 'unavailable' }); await f.history.writer.flush();
    const fact = f.rows()[0].fact; if (fact.kind !== 'session-operation') throw new Error('missing-session-fact');
    expect(fact.effects.find(e => e.effect === 'save-repository-preference')).toMatchObject({ acknowledgement: mode === 'lost-ack' ? 'unknown' : 'accepted', observation: mode === 'lost-ack' ? 'committed' : mode === 'unapplied' ? 'different' : 'unavailable' });
    expect(fact.effects.some(e => e.effect === 'save-vault')).toBe(mode === 'lost-ack'); expect(fact.effects.some(e => e.effect === 'cleanup-active')).toBe(mode !== 'lost-ack');
});
it('a session preview observed while off is never backfilled after later verified activation', async () => {
    const f = await fixture(); const gate = deferred<ReadResult>(); vi.mocked(f.sessions.reader.read).mockReturnValueOnce(gate.promise);
    const running = f.change(CONNECTION_INPUT); await vi.waitFor(() => expect(f.sessions.reader.read).toHaveBeenCalledOnce());
    await f.history.settings.update(s => ({ ...s, center: { ...s.center, diagnostics: true } })); f.policiesData.set('diagnostics', activeCollectionPolicy()); await f.history.refresh();
    gate.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 }); await running; await f.history.writer.flush();
    expect(f.rows()).toHaveLength(0); expect(await f.read()).toMatchObject({ operation: { retention: 'untracked', stage: 'settled' } });
});
it('an admitted exact row may finish while collection is durably off without acquiring another ticket', async () => {
    const f = await fixture(true); const admit = vi.spyOn(f.history.writer, 'admit'); const gate = deferred<ReadResult>(); vi.mocked(f.sessions.reader.read).mockReturnValueOnce(gate.promise);
    const running = f.change(CONNECTION_INPUT); await vi.waitFor(() => expect(f.sessions.reader.read).toHaveBeenCalledOnce()); await f.history.writer.flush();
    await f.history.settings.update(s => ({ ...s, center: { ...s.center, diagnostics: false } })); await f.history.refresh();
    gate.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 }); await running; await f.history.writer.flush();
    expect(admit).toHaveBeenCalledTimes(1); expect(f.rows()).toHaveLength(1); expect(f.rows()[0].fact).toMatchObject({ state: 'settled', result: 'ready' }); expect(await f.read()).toMatchObject({ operation: { retention: 'stored' } });
});
it('canonical clear retires a session ticket so late completion cannot recreate its row', async () => {
    const f = await fixture(true); const gate = deferred<ReadResult>(); vi.mocked(f.sessions.reader.read).mockReturnValueOnce(gate.promise);
    const running = f.change(CONNECTION_INPUT); await vi.waitFor(() => expect(f.sessions.reader.read).toHaveBeenCalledOnce()); await f.history.writer.flush();
    await f.history.settings.update(s => ({ ...s, center: { ...s.center, diagnostics: false } })); await f.history.refresh();
    const current = await f.history.store.execute('diagnostics', { type: 'read', now: Date.now() }); if (current.state !== 'ready') throw new Error('history-read-failed');
    expect(await f.history.store.execute('diagnostics', { type: 'clear', now: Date.now(), epoch: current.snapshot.epoch, revision: current.snapshot.revision }, () => true, f.history.coordinator.pausedPolicyRevision('diagnostics')!)).toMatchObject({ state: 'written' });
    gate.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 }); await running; await f.history.writer.flush();
    expect(f.rows()).toHaveLength(0); expect(await f.read()).toMatchObject({ operation: { stage: 'settled', retention: 'untracked' } });
});
it('a secondary journal fault cannot roll back independently verified protected session state', async () => {
    const f = await fixture(true); vi.mocked(f.journals.execute).mockRejectedValue(new Error('private'));
    expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready', connected: true }); await f.history.writer.flush();
    expect(f.sessions.values.has(NAMED_SESSIONS_KEY)).toBe(true); expect(await f.read()).toMatchObject({ operation: { fact: { result: 'ready' } } }); expect(f.rows()).toHaveLength(0);
});
it('preference and session families share one current slot while retaining independent historical facts', async () => {
    const f = await fixture(); await f.change(CONNECTION_INPUT); const owner = await f.open();
    expect(await f.call({ ...owner, method: 'center.preview', expectedRevision: 1, intent: { type: 'preferences', values: { density: 'compact' } } })).toMatchObject({ state: 'preview' });
    expect(await f.read()).toMatchObject({ operation: { family: 'settings', stage: 'reviewed' } });
});
it('an observer or another native document cannot read or create the editor’s private session target', async () => {
    const f = await fixture(); await f.change(CONNECTION_INPUT); const sender = { ...CENTER_SENDER, documentId: 'observer', tab: { id: 2, incognito: false } }; const other = await f.open(sender);
    expect(await f.call({ method: 'center.operation.read', clientId: f.owner.clientId }, sender)).toEqual({ state: 'stale' });
    expect(await f.call({ method: 'center.operation.read', clientId: other.clientId }, sender)).toEqual({ state: 'empty' });
    expect(await f.call({ ...other, method: 'center.connections.change', intent: { type: 'revoke-all' }, expectedRevision: 0 }, sender)).toEqual({ state: 'denied' });
});
it('a later unrelated credential epoch irreversibly retires the captured session target', async () => {
    const f = await fixture(); await f.change(CONNECTION_INPUT); await f.sessions.service.revoke(); expect(await f.read()).toMatchObject({ operation: { sourceCurrent: false, target: null, fact: { result: 'ready' } } });
});
