import { expect, it, vi } from 'vitest';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { CONNECTED, deferred } from '../fixtures/runtime.ts';

it('verifies provider identities before storing a protected named session and exposes only its selected read purpose', async () => {
    const h = namedSessionsFixture();
    expect(await h.connections.read(h.current)).toMatchObject({ state: 'ready', revision: 0, entries: [], connected: false });
    const result = await h.connections.change(CONNECTION_INPUT, 0, h.current);
    expect(result).toMatchObject({ state: 'ready', revision: 1, selected: 'session-1', connected: true,
        entries: [{ viewerId: '1', viewerLogin: 'octo', repositoryId: '7', repository: 'octo/example', role: 'repository-read' }] });
    expect(JSON.stringify(result)).not.toContain(CONNECTION_INPUT.secret);
    expect(h.namedPorts.connected).toHaveBeenCalledWith('7', expect.any(Function));
    expect(h.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ entries: [{ connection: CONNECTED }] });
    expect(await h.connections.read(h.current)).toEqual(result);
});
it('keeps five explicit identities bounded and rejects stale revisions or duplicate names without touching the active credential', async () => {
    const h = namedSessionsFixture();
    for (let index = 0; index < 5; index++) expect(await h.connections.change({ ...CONNECTION_INPUT, name: `Work ${index}` }, index, h.current)).toMatchObject({ state: 'ready', revision: index + 1 });
    const epoch = h.service.status().epoch; const reads = vi.mocked(h.reader.read).mock.calls.length;
    expect(await h.connections.change({ ...CONNECTION_INPUT, name: 'Sixth' }, 5, h.current)).toEqual({ state: 'capacity' });
    expect(await h.connections.change({ type: 'select', id: 'session-1' }, 4, h.current)).toEqual({ state: 'conflict' });
    expect(await h.connections.change({ type: 'select', id: 'missing' }, 5, h.current)).toEqual({ state: 'invalid' });
    expect(h.service.status().epoch).toBe(epoch); expect(h.reader.read).toHaveBeenCalledTimes(reads);
    await h.connections.change({ type: 'remove', id: 'session-1' }, 5, h.current);
    expect(h.service.status().state).toBe('connected');
    expect(await h.connections.change({ ...CONNECTION_INPUT, name: 'work 4' }, 6, h.current)).toEqual({ state: 'invalid' });
});
it('re-verifies the numeric identities when switching and accepts a canonical rename without changing the authority', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    await h.connections.change({ ...CONNECTION_INPUT, name: 'Other' }, 1, h.current);
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 12,
        data: request.type === 'viewer' ? { id: '1', login: 'renamed' } : { id: '7', name: 'octo/renamed' } }));
    expect(await h.connections.change({ type: 'select', id: 'session-1' }, 2, h.current)).toMatchObject({ state: 'ready', selected: 'session-1',
        entries: [{ repositoryId: '7', repository: 'octo/renamed', viewerLogin: 'renamed' }, { repository: 'octo/example' }] });
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 12,
        data: request.type === 'viewer' ? { id: '1', login: 'renamed' } : { id: '99', name: 'octo/renamed' } }));
    expect(await h.connections.change({ type: 'select', id: 'session-1' }, 3, h.current)).toEqual({ state: 'unavailable' });
    expect(h.service.status().state).not.toBe('connected'); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('disconnect removes the selected protected credential while removal of an inactive entry preserves the current selection', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    await h.connections.change({ ...CONNECTION_INPUT, name: 'Other', secret: 'synthetic_other_credential' }, 1, h.current);
    expect(await h.connections.change({ type: 'remove', id: 'session-1' }, 2, h.current)).toMatchObject({ state: 'ready', selected: 'session-2', connected: true, entries: [{ name: 'Other' }] });
    expect(await h.connections.change({ type: 'disconnect' }, 3, h.current)).toMatchObject({ state: 'ready', selected: null, connected: false, entries: [] });
    expect(JSON.stringify([...h.values.values()])).not.toContain('synthetic_other_credential');
    await h.connections.change(CONNECTION_INPUT, 4, h.current);
    expect(await h.connections.change({ type: 'remove', id: 'session-3' }, 5, h.current)).toMatchObject({ state: 'ready', entries: [], connected: false });
});
it.each(['before', 'viewer', 'repository'] as const)('retires connection work after loss of its controller at %s without storing a late credential', async phase => {
    const h = namedSessionsFixture(); await h.service.start();
    if (phase === 'before') h.current.mockReturnValue(false);
    else {
        const pending = deferred<ReadResult>();
        vi.mocked(h.reader.read).mockImplementation(async request => phase === request.type ? pending.promise :
            { state: 'ok', etag: '', bytes: 12, data: { id: '1', login: 'octo' } });
        const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current);
        await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(phase === 'viewer' ? 1 : 2));
        h.current.mockReturnValue(false); pending.resolve({ state: 'ok', etag: '', bytes: 12,
            data: phase === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'octo/example' } });
        expect(await mutation).toEqual({ state: 'stale' });
    }
    if (phase === 'before') expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toEqual({ state: 'stale' });
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('serializes permission revocation after an admitted storage write so a late completion cannot resurrect protected records', async () => {
    const h = namedSessionsFixture(); const entered = deferred<void>(); const release = deferred<void>();
    const write = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => {
        if (key === NAMED_SESSIONS_KEY) { entered.resolve(); await release.promise; }
        await write(key, value);
    });
    const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current); await entered.promise;
    const revoke = h.connections.revokeAll(); release.resolve();
    expect(await mutation).toEqual({ state: 'stale' }); await revoke;
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false);
    expect(await h.connections.read(h.current)).toMatchObject({ state: 'ready', entries: [] });
});
it.each([true, false])('reconciles one failed storage acknowledgement without repeating the write (persisted=%s)', async persisted => {
    const h = namedSessionsFixture(); const write = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => {
        if (key === NAMED_SESSIONS_KEY) { if (persisted) await write(key, value); throw new Error('private quota evidence'); }
        await write(key, value);
    });
    const result = await h.connections.change(CONNECTION_INPUT, 0, h.current);
    expect(result).toMatchObject({ state: persisted ? 'ready' : 'unknown' });
    expect(vi.mocked(h.port.set).mock.calls.filter(([key]) => key === NAMED_SESSIONS_KEY)).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/private|synthetic/u);
    expect(h.service.status().state).toBe(persisted ? 'connected' : 'disconnected');
});
it('rejects malformed vaults and unavailable protection, and does not expose provider exceptions or allow concurrent mutations', async () => {
    for (const value of [{ schemaVersion: 2 }, { secret: 'private' }]) {
        const h = namedSessionsFixture(); h.values.set(NAMED_SESSIONS_KEY, value);
        expect(await h.connections.read(h.current)).toEqual({ state: 'unavailable' });
    }
    const h = namedSessionsFixture(); h.namedPorts.protected.mockResolvedValueOnce(false);
    expect(await h.connections.read(h.current)).toEqual({ state: 'unavailable' });
    const wait = deferred<boolean>(); h.namedPorts.protected.mockReturnValueOnce(wait.promise);
    const first = h.connections.change(CONNECTION_INPUT, 0, h.current);
    expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toEqual({ state: 'conflict' });
    wait.resolve(true); await first;
    h.current.mockReturnValue(false); expect(await h.connections.read(h.current)).toEqual({ state: 'stale' });
    expect(await h.connections.change({ type: 'disconnect', command: 'private' } as never, 1, h.current)).toEqual({ state: 'invalid' });
});
it('preserves an existing verified H2 connection as an explicit previous session without rewriting it just to display it', async () => {
    const h = namedSessionsFixture(); h.values.set(SESSION_KEY, CONNECTED);
    expect(await h.connections.read(h.current)).toMatchObject({ state: 'ready', revision: 0, selected: 'previous-session', connected: false,
        entries: [{ name: 'GitHub', repositoryId: '7' }] });
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
    await h.connections.change({ type: 'disconnect' }, 0, h.current);
    expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('forgets an unreadable protected vault only on explicit revoke-all, independently of its schema and preference storage', async () => {
    const h = namedSessionsFixture(); h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 999, secret: 'private_future' });
    expect(await h.connections.read(h.current)).toEqual({ state: 'unavailable' });
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(true);
    expect(await h.connections.change({ type: 'revoke-all' }, 0, h.current)).toMatchObject({ state: 'ready', entries: [], selected: null });
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
    h.values.set(SESSION_KEY, CONNECTED);
    vi.mocked(h.port.remove).mockRejectedValueOnce(new Error('private delete failure'));
    expect(await h.connections.change({ type: 'revoke-all' }, 0, h.current)).toEqual({ state: 'unavailable' });
});
it('announces initial evidence invalidation and the final failure even when verification cannot establish the candidate', async () => {
    const h = namedSessionsFixture(); await h.service.start(); const pending = deferred<ReadResult>();
    vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current);
    await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    expect(h.namedPorts.changed).toHaveBeenCalledTimes(1); expect(h.service.status().state).not.toBe('connected');
    pending.resolve({ state: 'denied', bytes: 0 }); expect(await mutation).toEqual({ state: 'unavailable' });
    expect(h.namedPorts.changed).toHaveBeenCalledTimes(2);
});
it('retains safe state when protected storage or the preference grant cannot be saved', async () => {
    for (const failure of ['vault', 'revoke', 'grant'] as const) {
        const h = namedSessionsFixture(); await h.service.start();
        if (failure === 'vault') h.namedPorts.protected.mockRejectedValueOnce(new Error('private storage'));
        if (failure === 'revoke') { h.values.set(SESSION_KEY, CONNECTED); vi.mocked(h.port.remove).mockRejectedValueOnce(new Error('private remove')); }
        if (failure === 'grant') h.namedPorts.connected.mockRejectedValueOnce(new Error('private grant'));
        expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toEqual({ state: 'unavailable' });
        expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.service.status().state).not.toBe('connected');
    }
});
it('retains the explicit wait outcome and rejects a broken or colliding local identifier without retaining the candidate', async () => {
    const h = namedSessionsFixture(); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'limited', retryAfter: 60, bytes: 0 });
    expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toEqual({ state: 'limited' });
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
    for (const collision of [false, true]) {
        const other = namedSessionsFixture();
        if (collision) await other.connections.change(CONNECTION_INPUT, 0, other.current);
        other.namedPorts.identifier.mockReturnValue(collision ? 'session-1' : 'BAD');
        expect(await other.connections.change({ ...CONNECTION_INPUT, name: 'Candidate' }, collision ? 1 : 0, other.current)).toEqual({ state: 'unavailable' });
        expect(other.service.status().state).not.toBe('connected');
    }
});
it.each(['load', 'revocation', 'grant'] as const)('a late controller loss at %s cannot publish the candidate vault', async phase => {
    const h = namedSessionsFixture(); await h.service.start(); const entered = deferred<void>(); const release = deferred<void>();
    if (phase === 'load') h.namedPorts.protected.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return true; });
    if (phase === 'revocation') {
        const remove = vi.mocked(h.port.remove).getMockImplementation()!;
        vi.mocked(h.port.remove).mockImplementationOnce(async key => { entered.resolve(); await release.promise; await remove(key); });
    }
    if (phase === 'grant') h.namedPorts.connected.mockImplementationOnce(async () => { entered.resolve(); await release.promise; });
    const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current); await entered.promise; h.current.mockReturnValue(false); release.resolve();
    expect(await mutation).toEqual({ state: 'stale' }); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('retires a write queued behind an earlier protected cleanup when its controller is lost before storage admission', async () => {
    const h = namedSessionsFixture(); await h.connections.read(h.current);
    const entered = deferred<void>(); const release = deferred<void>(); const remove = vi.mocked(h.port.remove).getMockImplementation()!;
    vi.mocked(h.port.remove).mockImplementation(async key => { if (key === NAMED_SESSIONS_KEY) { entered.resolve(); await release.promise; } await remove(key); });
    const cleanup = h.connections.revokeAll(); await entered.promise;
    h.namedPorts.connected.mockImplementationOnce(async () => {
        queueMicrotask(() => queueMicrotask(() => h.current.mockReturnValue(false)));
    });
    const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current);
    await vi.waitFor(() => expect(h.current()).toBe(false)); release.resolve(); await cleanup;
    expect(await mutation).toEqual({ state: 'stale' }); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('does not revoke an already selected credential when the admission fence rejects a new direct connection', async () => {
    const h = namedSessionsFixture(); await h.service.connect(CONNECTION_INPUT.secret, CONNECTION_INPUT.repository);
    const epoch = h.service.status().epoch;
    await h.service.connect('synthetic_rejected', 'octo/other', undefined, () => false);
    expect(h.service.status()).toMatchObject({ state: 'connected', epoch });
    expect(h.service.verifiedIdentity()).toMatchObject({ repository: 'octo/example' });
});
