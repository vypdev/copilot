import { expect, it, vi } from 'vitest';
import { sessionObserverFixture as fixture } from '../fixtures/session_observer.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { CONNECTED, deferred } from '../fixtures/runtime.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { validSessionFact } from '../../src/domain/session_fact.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

it('the actual connect owner exposes four independent native attempts and a current own-epoch source without private journal fields', async () => {
    const f = fixture(); expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready', connected: true });
    expect(f.last().engine.fact.effects.map(e => e.effect)).toEqual(['retire-active', 'retire-active', 'save-active', 'save-vault']);
    expect(f.last().current()).toBe(true); expect(f.last().label).toBe('Work'); expect(f.last().engine.fact).toMatchObject({ state: 'settled', result: 'ready', incomplete: false });
    for (const privateValue of [CONNECTED.secret, CONNECTED.repository, 'session-1', 'Work', f.owner.clientId]) expect(JSON.stringify(f.snapshots)).not.toContain(privateValue);
    expect(f.snapshots.every(validSessionFact)).toBe(true);
});
it('selecting an existing session verifies and saves active and vault state independently', async () => {
    const f = fixture(); await f.change(CONNECTION_INPUT); expect(await f.change({ type: 'select', id: 'session-1' }, 1)).toMatchObject({ state: 'ready', connected: true });
    expect(f.last().engine.fact).toMatchObject({ action: 'select', result: 'ready' }); expect(f.last().current()).toBe(true);
});
it('disconnect captures the selected name before removal and retains both actual deletion and vault save facts', async () => {
    const f = fixture(); await f.change(CONNECTION_INPUT); expect(await f.change({ type: 'disconnect' }, 1)).toMatchObject({ state: 'ready', connected: false });
    expect(f.last().label).toBe('Work'); expect(f.last().engine.fact.effects.map(e => e.effect)).toEqual(['retire-active', 'save-vault']); expect(f.last().current()).toBe(true);
});
it.each([false, true])('removing a selected entry (%s) records only effects that actually ran', async selected => {
    const f = fixture(); await f.change(CONNECTION_INPUT); await f.change({ ...CONNECTION_INPUT, name: 'Second' }, 1);
    expect(await f.change({ type: 'remove', id: selected ? 'session-2' : 'session-1' }, 2)).toMatchObject({ state: 'ready', connected: !selected });
    expect(f.last().engine.fact.effects.map(e => e.effect)).toEqual(selected ? ['retire-active', 'save-vault'] : ['save-vault']); expect(f.last().label).toBe(selected ? 'Second' : 'Work');
});
it('explicit forget-all records active-key and vault removal even for an unreadable vault', async () => {
    const f = fixture(); f.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 99 }); f.values.set(SESSION_KEY, CONNECTED);
    expect(await f.change({ type: 'revoke-all' })).toMatchObject({ state: 'ready', entries: [] });
    expect(f.last().engine.fact.effects.map(e => e.effect).sort()).toEqual(['remove-vault', 'retire-active']); expect(f.last().current()).toBe(true);
});
it.each(['lost-ack', 'unapplied', 'rejected', 'sync', 'unreadable', 'changed', 'future'] as const)('native vault %s is observed once with independent active cleanup', async mode => {
    const f = fixture(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation((key, value) => {
        if (key === NAMED_SESSIONS_KEY && mode === 'sync') throw new Error('private');
        return (async () => {
            if (key !== NAMED_SESSIONS_KEY) return set(key, value);
            if (mode === 'unapplied') return; if (mode === 'rejected') throw new Error('private');
            await set(key, mode === 'changed' ? { ...value as object, revision: 999 } : mode === 'future' ? { schemaVersion: 99 } : value);
            if (mode === 'unreadable') vi.mocked(f.port.get).mockRejectedValueOnce(new Error('private'));
            if (mode === 'lost-ack') throw new Error('private');
        })();
    });
    expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: mode === 'lost-ack' ? 'ready' : 'unknown' });
    const fact = f.last().engine.fact; const vault = fact.effects.find(e => e.effect === 'save-vault')!;
    expect(vault).toMatchObject({ state: 'settled', acknowledgement: ['lost-ack', 'rejected', 'sync'].includes(mode) ? 'unknown' : 'accepted', observation: mode === 'lost-ack' ? 'committed' : mode === 'unreadable' ? 'unavailable' : 'different' });
    expect(fact.effects.some(e => e.effect === 'cleanup-active')).toBe(mode !== 'lost-ack'); expect(vi.mocked(f.port.set).mock.calls.filter(([key]) => key === NAMED_SESSIONS_KEY)).toHaveLength(1);
});
it('a persisted vault with reordered keys survives lost acknowledgement without another save', async () => {
    const f = fixture(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (key, value) => { await set(key, key === NAMED_SESSIONS_KEY ? Object.fromEntries(Object.entries(value as object).reverse()) : value); if (key === NAMED_SESSIONS_KEY) throw new Error('private'); });
    expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready' }); expect(f.last().engine.fact.effects.at(-1)).toMatchObject({ effect: 'save-vault', acknowledgement: 'unknown', observation: 'committed' });
});
it.each(['active', 'vault'])('forget-all cannot claim both removals when the %s native key remains', async which => {
    const f = fixture(); await f.change(CONNECTION_INPUT); const remove = vi.mocked(f.port.remove).getMockImplementation()!;
    vi.mocked(f.port.remove).mockImplementation(async key => { if (key !== (which === 'active' ? SESSION_KEY : NAMED_SESSIONS_KEY)) await remove(key); });
    expect(await f.change({ type: 'revoke-all' })).toEqual({ state: 'unavailable' });
    expect(f.last().engine.fact.effects.find(e => e.effect === (which === 'active' ? 'retire-active' : 'remove-vault'))).toMatchObject({ acknowledgement: 'accepted', observation: 'different' });
    expect(f.last().engine.fact.effects.find(e => e.effect === (which === 'active' ? 'remove-vault' : 'retire-active'))?.observation).toBe('committed');
});
it('forget-all accepts canonically removed vault state after a lost acknowledgement without a second removal', async () => {
    const f = fixture(); await f.change(CONNECTION_INPUT); const remove = vi.mocked(f.port.remove).getMockImplementation()!;
    vi.mocked(f.port.remove).mockImplementation(async key => { await remove(key); if (key === NAMED_SESSIONS_KEY) throw new Error('private'); });
    expect(await f.change({ type: 'revoke-all' })).toMatchObject({ state: 'ready' }); expect(f.last().engine.fact.effects.find(e => e.effect === 'remove-vault')).toMatchObject({ acknowledgement: 'unknown', observation: 'committed' });
});
it('an inactive-entry vault failure preserves the unrelated selected active identity', async () => {
    const f = fixture(); await f.change(CONNECTION_INPUT); await f.change({ ...CONNECTION_INPUT, name: 'Second' }, 1); vi.mocked(f.port.set).mockRejectedValueOnce(new Error('private'));
    expect(await f.change({ type: 'remove', id: 'session-1' }, 2)).toEqual({ state: 'unknown' }); expect(f.service.status().state).toBe('connected'); expect(f.last().engine.fact.effects.map(e => e.effect)).toEqual(['save-vault']);
});
it.each(['capture', 'step', 'submitted', 'settled', 'credential', 'complete'] as const)('a broken %s observer cannot alter the actual session result or repeat storage', async event => {
    const f = fixture(); const broken = () => { throw new Error('private'); };
    f.observe.mockImplementation(() => { if (event === 'capture') return broken(); return { step: () => { if (event === 'step') return broken(); return { submitted: event === 'submitted' ? broken : () => undefined, settled: event === 'settled' ? broken : () => undefined }; }, credential: event === 'credential' ? broken : () => undefined, complete: event === 'complete' ? broken : () => undefined }; });
    expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready', connected: true }); expect(vi.mocked(f.port.set).mock.calls.filter(([key]) => key === NAMED_SESSIONS_KEY)).toHaveLength(1);
});
it.each([{ ...CONNECTION_INPUT, name: '' }, { type: 'remove', id: 'missing' }, { type: 'select', id: 'missing' }] as const)('preflight rejection %j acquires no observation or storage effect', async intent => {
    const f = fixture(); await f.change(intent); expect(f.observe).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
it('a vault-revision conflict acquires no observation or provider read', async () => {
    const f = fixture(); expect(await f.change(CONNECTION_INPUT, 9)).toEqual({ state: 'conflict' }); expect(f.observe).not.toHaveBeenCalled(); expect(f.reader.read).not.toHaveBeenCalled();
});
it('a failing native admission query returns an unavailable service result without recording or leaking the failure', async () => {
    const f = fixture(); f.current.mockImplementationOnce(() => { throw new Error('private native source'); });
    expect(await f.change(CONNECTION_INPUT)).toEqual({ state: 'unavailable' }); expect(f.observe).not.toHaveBeenCalled();
    expect(f.reader.read).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
it('source loss while native restoration completes stops before capture or an attributed storage effect', async () => {
    const f = fixture(); vi.spyOn(f.service, 'start').mockImplementationOnce(async () => { f.current.mockReturnValue(false); });
    expect(await f.change(CONNECTION_INPUT)).toEqual({ state: 'stale' }); expect(f.observe).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
it('disconnect with no selected entry captures no fabricated private name and still reports its actual effects', async () => {
    const f = fixture(); expect(await f.change({ type: 'disconnect' })).toMatchObject({ state: 'ready', entries: [] });
    expect(f.last().label).toBeNull(); expect(f.last().engine.fact.effects.map(effect => effect.effect)).toEqual(['retire-active', 'save-vault']);
});
it('a failed source query inside queued vault persistence performs no vault write and does not poison the next session operation', async () => {
    const f = fixture(); f.namedPorts.connected.mockImplementationOnce(async () => {
        f.current.mockReturnValueOnce(true).mockImplementationOnce(() => { throw new Error('private source failure'); });
    });
    expect(await f.change(CONNECTION_INPUT)).toEqual({ state: 'unavailable' }); expect(f.values.has(NAMED_SESSIONS_KEY)).toBe(false);
    expect(f.last().engine.fact.effects.some(effect => effect.effect === 'save-vault')).toBe(false); expect(f.values.has(SESSION_KEY)).toBe(false);
    expect(await f.change(CONNECTION_INPUT)).toMatchObject({ state: 'ready', connected: true });
});
it('permission-owner forgetting remains live and clears both keys even if its optional observer fails at capture', async () => {
    const f = fixture(); await f.change(CONNECTION_INPUT);
    await f.connections.revokeAll((_action, _target, live) => { expect(live()).toBe(true); throw new Error('secondary capture'); });
    expect(f.values.has(SESSION_KEY)).toBe(false); expect(f.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('permission-driven forgetting retires the pending source without attributing a second user operation', async () => {
    const f = fixture(); const gate = deferred<ReadResult>(); vi.mocked(f.reader.read).mockReturnValueOnce(gate.promise);
    const pending = f.change(CONNECTION_INPUT); await vi.waitFor(() => expect(f.reader.read).toHaveBeenCalledOnce()); await f.connections.revokeAll(); expect(f.last().current()).toBe(false);
    gate.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 }); expect(await pending).toEqual({ state: 'stale' }); expect(f.observe).toHaveBeenCalledOnce(); expect(f.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('capture-side ownership loss stops before any admitted native attempt and terminal facts remain historical', async () => {
    const f = fixture(); const capture = f.observe.getMockImplementation()!;
    f.observe.mockImplementation((...args) => { const trace = capture(...args); f.current.mockReturnValue(false); return trace; });
    expect(await f.change(CONNECTION_INPUT)).toEqual({ state: 'stale' }); expect(f.last().engine.fact.effects).toEqual([]); expect(f.last().current()).toBe(false); expect(f.port.set).not.toHaveBeenCalled();
});
