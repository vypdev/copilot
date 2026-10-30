import { expect, it, vi } from 'vitest';
import { connectionIntent } from '../../src/domain/named_sessions.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';

it('admits an explicit new repository address only on the existing selected read-session intent', () => {
    expect(connectionIntent({ type: 'select', id: 'session-1', repository: 'team/renamed' })).toBe(true);
});
it('verifies the new address with the same saved account/repository and persists only fresh canonical ownership', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', bytes: 12, etag: '',
        data: request.type === 'viewer' ? { id: '1', login: 'renamed-user' } : { id: '7', name: 'team/renamed', organizationId: '20' } }));
    const outcome = await h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 1, h.current);
    expect(outcome).toMatchObject({ state: 'ready', revision: 2, connected: true, entries: [{ repositoryId: '7', repository: 'team/renamed', organizationId: '20' }] });
    expect(h.reader.read).toHaveBeenLastCalledWith({ type: 'repository', name: 'team/renamed' }, CONNECTION_INPUT.secret, expect.anything(), undefined);
    expect(h.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ entries: [{ connection: { repository: 'team/renamed', repositoryId: '7' } }] });
    expect(JSON.stringify(outcome)).not.toContain(CONNECTION_INPUT.secret);
});
it('a reused address with another numeric repository cannot replace the saved protected target', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', bytes: 12, etag: '',
        data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '99', name: 'team/renamed' } }));
    expect(await h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 1, h.current)).toEqual({ state: 'unavailable' });
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect(h.service.status().state).not.toBe('connected');
});
it('a different numeric account cannot reuse the saved repository credential as another identity', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current); const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', bytes: 12, etag: '',
        data: request.type === 'viewer' ? { id: '99', login: 'other' } : { id: '7', name: 'team/renamed' } }));
    expect(await h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 1, h.current)).toEqual({ state: 'unavailable' });
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect(h.service.status().state).not.toBe('connected');
});
it('a stale revision rejects relocation before credential invalidation or provider access', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current); const epoch = h.service.status().epoch; const reads = vi.mocked(h.reader.read).mock.calls.length;
    expect(await h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 0, h.current)).toEqual({ state: 'conflict' });
    expect(h.service.status().epoch).toBe(epoch); expect(h.reader.read).toHaveBeenCalledTimes(reads);
});
it('an unchanged address is explicitly reverified without inventing a new role or identity', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    expect(await h.connections.change({ type: 'select', id: 'session-1', repository: 'octo/example' }, 1, h.current)).toMatchObject({ state: 'ready', revision: 2, entries: [{ role: 'repository-read' }] });
    expect(h.reader.read).toHaveBeenCalledTimes(4);
});
it('denied verification preserves the named record and makes no automatic retry or object request', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current); const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'denied', bytes: 0 });
    expect(await h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 1, h.current)).toEqual({ state: 'unavailable' });
    expect(h.reader.read).toHaveBeenCalledTimes(3); expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before);
});
it.each([true, false])('one failed named-vault acknowledgement is observed, never rewritten (persisted=%s)', async persisted => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current); const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    const write = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { if (key === NAMED_SESSIONS_KEY) { if (persisted) await write(key, value); throw new Error('private quota'); } await write(key, value); });
    const result = await h.connections.change({ type: 'select', id: 'session-1', repository: 'octo/example' }, 1, h.current);
    expect(result.state).toBe(persisted ? 'ready' : 'unknown'); expect(JSON.stringify(result)).not.toContain('private quota');
    expect(vi.mocked(h.port.set).mock.calls.filter(([key]) => key === NAMED_SESSIONS_KEY)).toHaveLength(2);
    if (!persisted) expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before);
});
it('controller loss during address verification cannot publish a late candidate or named record', async () => {
    const { deferred } = await import('../fixtures/runtime.ts'); const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY)); const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(h.reader.read).mockImplementation(async request => { if (request.type === 'repository') { entered.resolve(); await gate.promise; }
        return { state: 'ok', bytes: 12, etag: '', data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'team/renamed' } }; });
    const result = h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 1, h.current);
    await entered.promise; h.current.mockReturnValue(false); gate.resolve(); expect(await result).toEqual({ state: 'stale' });
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect(h.service.status().state).not.toBe('connected');
});
it('permission revocation during a new-address read fences its candidate without changing the prior named record', async () => {
    const { deferred } = await import('../fixtures/runtime.ts'); const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY)); const gate = deferred<void>(); const entered = deferred<void>();
    vi.mocked(h.reader.read).mockImplementation(async request => { if (request.type === 'repository') { entered.resolve(); await gate.promise; }
        return { state: 'ok', bytes: 12, etag: '', data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'team/renamed' } }; });
    const operation = h.connections.change({ type: 'select', id: 'session-1', repository: 'team/renamed' }, 1, h.current);
    await entered.promise; h.ports.permitted.mockResolvedValue(false); gate.resolve(); await operation;
    expect(h.service.status().state).not.toBe('connected'); expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before);
});
