import { afterEach, expect, it, vi } from 'vitest';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { CONNECTED, deferred, sessionHarness } from '../fixtures/runtime.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { currentSessionProfile, sessionPreferenceRestriction } from '../../src/domain/session_preferences.ts';

const nativeSession = { ...CONNECTED, schemaVersion: 1 as const };
afterEach(() => vi.restoreAllMocks());
async function connected() {
    const h = namedSessionsFixture(); expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toMatchObject({ state: 'ready', connected: true });
    vi.mocked(h.reader.read).mockClear(); vi.mocked(h.port.get).mockClear(); vi.mocked(h.port.set).mockClear(); return h;
}
it('actual native selection observation returns a detached verified binding without returning a credential or performing HTTP/writes', async () => {
    const h = await connected(); const value = await h.connections.preferenceBinding(h.current);
    expect(value).toMatchObject({ state: 'ready', name: 'Work', account: 'octo', repository: 'octo/example', context: { verified: true,
        credentialEpoch: h.service.status().epoch, scope: { entryId: 'session-1', selectionRevision: 1, accountId: '1', repositoryId: '7' } } });
    expect(JSON.stringify(value)).not.toContain(CONNECTION_INPUT.secret); expect(Object.isFrozen(value)).toBe(true);
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalledWith(SESSION_KEY);
});
it('a new worker observes only a retained match until ordinary verification succeeds, while keeping the stable native selection ownership', async () => {
    const previous = await connected(); const fresh = namedSessionsFixture();
    for (const [key, value] of previous.values) fresh.values.set(key, structuredClone(value));
    const retained = await fresh.connections.preferenceBinding(fresh.current); expect(retained).toMatchObject({ state: 'ready', context: { verified: false, credentialEpoch: 0, scope: { entryId: 'session-1', selectionRevision: 1 } } });
    expect(fresh.reader.read).not.toHaveBeenCalled(); fresh.advance(61000); await fresh.service.start();
    const verified = await fresh.connections.preferenceBinding(fresh.current); expect(verified).toMatchObject({ state: 'ready', context: { verified: true, credentialEpoch: 0 } });
    if (retained.state === 'ready' && verified.state === 'ready') {
        expect(verified.context.scope).toEqual(retained.context.scope);
        const document = { schemaVersion: 1 as const, revision: 1, scope: retained.context.scope, preferences: { paused: true } };
        expect(currentSessionProfile(document, retained.context)).toBeNull(); expect(currentSessionProfile(document, verified.context)).toMatchObject({ epoch: 0, preferences: { paused: true } });
    }
});
it('explicit reselection cannot reuse earlier enabling preferences and does not silently resume an earlier positive pause', async () => {
    const h = await connected(); const old = await h.connections.preferenceBinding(h.current); expect(old.state).toBe('ready');
    await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current); const current = await h.connections.preferenceBinding(h.current); expect(current.state).toBe('ready');
    if (old.state !== 'ready' || current.state !== 'ready') throw new Error('fixture-binding-unavailable');
    const document = { schemaVersion: 1 as const, revision: 1, scope: old.context.scope, preferences: { paused: true } };
    expect(current.context.credentialEpoch).not.toBe(old.context.credentialEpoch); expect(current.context.scope.selectionRevision).toBe(2);
    expect(currentSessionProfile(document, current.context)).toBeNull(); expect(sessionPreferenceRestriction({ state: 'ready', value: document }, current.context)).toEqual({ paused: true, reason: 'retained' });
});
it.each(['no-selection', 'legacy', 'invalid-vault', 'different-retained-credential'] as const)('the native %s state cannot fabricate a usable current preference context', async state => {
    const h = namedSessionsFixture();
    if (state === 'legacy') h.values.set(SESSION_KEY, CONNECTED);
    if (state === 'invalid-vault') h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 99 });
    if (state === 'different-retained-credential') {
        h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 1, revision: 1, selected: 'session-1', entries: [{ id: 'session-1', name: 'Work', host: 'github.com', role: 'repository-read', connection: CONNECTED }] });
        h.values.set(SESSION_KEY, { ...CONNECTED, secret: 'a_different_native_credential' });
    }
    expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: state === 'no-selection' ? 'disconnected' : state === 'legacy' ? 'legacy' : 'unavailable' });
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('a retired owner is rejected before storage and a changed native vault during inspection retires that observation', async () => {
    const h = await connected(); h.current.mockReturnValue(false); expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled();
    h.current.mockReturnValue(true); const read = vi.mocked(h.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.port.get).mockImplementation(async key => { const value = await read(key); if (key === NAMED_SESSIONS_KEY && ++reads === 1) h.values.set(key, { ...(value as object), revision: 2 }); return value; });
    expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['protected', 'permission'] as const)('retained equality with unavailable %s does not restore, remove or expose the native credential', async unavailable => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    if (unavailable === 'protected') h.ports.protected.mockResolvedValue(false); else h.ports.permitted.mockResolvedValue(false);
    expect(await h.service.matchesRetained(nativeSession)).toBe(false); expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.service.status().state).toBe('disconnected');
});
it('retained equality is fenced by the actual credential epoch when revocation overtakes a native read', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED); const gate = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(gate.promise);
    const matching = h.service.matchesRetained(nativeSession); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalledWith(SESSION_KEY));
    const revoking = h.service.revoke(); gate.resolve(CONNECTED); expect(await matching).toBe(false); await revoking; expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('an admitted connection mutation retires the private source lease before native IO even when it does not revoke the selected credential', async () => {
    const h = await connected(); const source = h.connections.capturePreferenceSource(); expect(source()).toBe(true);
    const gate = deferred<unknown>(); const entered = deferred<void>(); const get = vi.mocked(h.port.get).getMockImplementation()!;
    vi.mocked(h.port.get).mockImplementationOnce(async key => { entered.resolve(); await gate.promise; return get(key); });
    const changing = h.connections.change({ type: 'remove', id: 'not-saved' }, 1, h.current); await entered.promise;
    expect(source()).toBe(false); const reads = vi.mocked(h.port.get).mock.calls.length; expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: 'stale' }); expect(h.port.get).toHaveBeenCalledTimes(reads);
    gate.resolve(undefined); expect(await changing).toEqual({ state: 'invalid' }); expect(source()).toBe(false); expect(h.connections.capturePreferenceSource()()).toBe(true); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a native vault event retires an in-flight binding observation without changing the selected credential or starting provider work', async () => {
    const h = await connected(); const source = h.connections.capturePreferenceSource(); const get = vi.mocked(h.port.get).getMockImplementation()!;
    vi.mocked(h.port.get).mockImplementationOnce(async key => { const value = await get(key); h.connections.invalidatePreferenceSource(); return value; });
    expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: 'stale' }); expect(source()).toBe(false); expect(h.service.status().state).toBe('connected'); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a cold retained match retired during credential equality cannot publish even an unverified selection binding', async () => {
    const previous = await connected(); const h = namedSessionsFixture(); for (const [key, value] of previous.values) h.values.set(key, structuredClone(value));
    const get = vi.mocked(h.port.get).getMockImplementation()!;
    vi.mocked(h.port.get).mockImplementation(async key => { const value = await get(key); if (key === SESSION_KEY) h.connections.invalidatePreferenceSource(); return value; });
    expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a missing hot identity observation cannot be advertised as verified merely because an earlier credential equality was true', async () => {
    const h = await connected(); const epoch = h.service.status().epoch; vi.spyOn(h.service, 'verifiedIdentity').mockReturnValueOnce(null);
    expect(await h.connections.preferenceBinding(h.current)).toEqual({ state: 'stale' }); expect(h.service.status().epoch).toBe(epoch); expect(h.reader.read).not.toHaveBeenCalled();
});
