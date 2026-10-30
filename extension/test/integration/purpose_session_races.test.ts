import { expect, it, vi } from 'vitest';
import { purposeSessionsFixture as fixture } from '../fixtures/purpose_sessions.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { deferred, requestResult } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';
import type { SessionVault } from '../../src/domain/named_sessions.ts';

it.each(['viewer', 'repository'] as const)('forgetting during optional %s verification aborts its source and prevents any late credential resurrection', async stage => {
    const h = fixture(); await h.addRead(); h.resetCalls(); const entered = deferred<void>(); const release = deferred<ReadResult>();
    vi.mocked(h.reader.read).mockImplementation(async request => { if (request.type === stage) { entered.resolve(); return release.promise; } return requestResult(request); });
    const adding = h.add('issues-write', 1); await entered.promise; const cancellation = vi.mocked(h.reader.read).mock.calls.at(-1)![2]; await h.connections.revokeAll();
    expect(cancellation.aborted).toBe(true); release.resolve(stage === 'viewer' ? requestResult({ type: 'viewer' }) : requestResult({ type: 'repository', name: 'octo/example' }));
    expect(await adding).toEqual({ state: 'stale' }); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.writes()).toHaveLength(0);
});
it('a competing mutation cannot enter while an optional identity request is in flight', async () => {
    const h = fixture(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise); const adding = h.add('issues-write', 0);
    await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalled()); expect(await h.add('actions-write', 0)).toEqual({ state: 'conflict' });
    pending.resolve(requestResult({ type: 'viewer' })); expect(await adding).toMatchObject({ state: 'ready', revision: 1 }); expect(h.writes()).toHaveLength(1);
});
it.each(['source', 'permission', 'protection'] as const)('loss of %s during optional verification cannot save a credential or replace the read connection', async kind => {
    const h = fixture(); await h.addRead(); const active = structuredClone(h.values.get(SESSION_KEY)); h.resetCalls();
    vi.mocked(h.reader.read).mockImplementation(async request => {
        if (request.type === 'repository') { if (kind === 'source') h.current.mockReturnValue(false); if (kind === 'permission') h.ports.permitted.mockResolvedValue(false); if (kind === 'protection') h.ports.protected.mockResolvedValue(false); }
        return requestResult(request);
    });
    expect(await h.add('issues-write', 1)).toEqual({ state: kind === 'source' ? 'stale' : 'unavailable' });
    expect(h.values.get(SESSION_KEY)).toEqual(active); expect(h.writes()).toHaveLength(0); expect(h.namedPorts.connected).not.toHaveBeenCalled();
});
it('a native vault advanced during identity GETs cannot be overwritten even before any storage event is delivered', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY)) as SessionVault;
    vi.mocked(h.reader.read).mockImplementation(async request => { if (request.type === 'repository') h.values.set(NAMED_SESSIONS_KEY, { ...before, revision: 8 }); return requestResult(request); });
    expect(await h.add('issues-write', 1)).toEqual({ state: 'conflict' }); expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual({ ...before, revision: 8 }); expect(h.writes()).toHaveLength(0);
});
it.each(['create', 'select'] as const)('a lost %s native acknowledgement is accepted only after its exact canonical save is observed once', async operation => {
    const h = fixture(); await h.addRead(); if (operation === 'select') await h.add('issues-write', 1); h.resetCalls(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await set(key, value); if (key === NAMED_SESSIONS_KEY) throw new Error('lost native acknowledgement'); });
    const result = operation === 'create' ? await h.add('issues-write', 1) : await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current);
    expect(result).toMatchObject({ state: 'ready', revision: operation === 'create' ? 2 : 3 }); expect(h.writes()).toHaveLength(1);
    if (operation === 'select') expect(result).toMatchObject({ optionalWrites: { 'issues-write': { state: 'identity-verified', selected: 'session-2' } } });
});
it.each(['accepted', 'lost'] as const)('a %s save with nonmatching readback remains unknown and cannot promote optional identity proof', async acknowledgement => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); const active = structuredClone(h.values.get(SESSION_KEY)); h.resetCalls();
    const set = vi.mocked(h.port.set).getMockImplementation()!; vi.mocked(h.port.set).mockImplementation(async (key, value) => {
        if (key !== NAMED_SESSIONS_KEY) return set(key, value); if (acknowledgement === 'lost') throw new Error('lost acknowledgement');
    });
    expect(await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current)).toEqual({ state: 'unknown' }); expect(h.writes()).toHaveLength(1);
    expect(await h.read()).toMatchObject({ optionalWrites: { 'issues-write': { state: 'disabled' } } }); expect(h.values.get(SESSION_KEY)).toEqual(active);
});
it('failed readback after an accepted optional selection cannot fabricate a verified writer from a later generic metadata read', async () => {
    const h = fixture(); await h.add('issues-write', 0); h.resetCalls(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await set(key, value); if (key === NAMED_SESSIONS_KEY) vi.mocked(h.port.get).mockRejectedValueOnce(new Error('private readback failure')); });
    expect(await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current)).toEqual({ state: 'unknown' });
    expect(await h.read()).toMatchObject({ optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-1' } } }); expect(h.writes()).toHaveLength(1);
});
it('forgetting during an already submitted optional vault write runs physical deletion after that write and drains both effects', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); const entered = deferred<void>(); const release = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { if (key === NAMED_SESSIONS_KEY) { entered.resolve(); await release.promise; } await set(key, value); });
    const adding = h.add('issues-write', 1); await entered.promise; const forgetting = h.connections.revokeAll(); release.resolve();
    expect(await adding).toEqual({ state: 'stale' }); await forgetting; expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.writes()).toHaveLength(1);
});
it('a stale expected revision cannot start optional identity GETs or change read-session persistence', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); expect(await h.add('issues-write', 0)).toEqual({ state: 'conflict' }); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['viewer', 'repository'] as const)('a reselected optional session with changed numeric %s stays unselected and cannot replace its stored identity', async field => {
    const h = fixture(); await h.add('issues-write', 0); h.resetCalls(); const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    vi.mocked(h.reader.read).mockImplementation(async request => request.type === field ? { ...requestResult(request), data: field === 'viewer' ? { id: '2', login: 'other' } : { id: '8', name: 'octo/example' } } : requestResult(request));
    expect(await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current)).toEqual({ state: 'unavailable' }); expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect(h.writes()).toHaveLength(0);
});
it('explicit relocation can update canonical spelling only after matching the saved optional numeric identities', async () => {
    const h = fixture(); await h.add('issues-write', 0); h.resetCalls(); vi.mocked(h.reader.read).mockImplementation(async request => request.type === 'repository'
        ? { ...requestResult(request), data: { id: '7', name: 'octo/renamed', organizationId: '9' } } : requestResult(request));
    expect(await h.connections.change({ type: 'select', id: 'session-1', repository: 'octo/renamed' }, 1, h.current)).toMatchObject({ state: 'ready', selected: null,
        entries: [{ repositoryId: '7', repository: 'octo/renamed', organizationId: '9' }], optionalWrites: { 'issues-write': { state: 'identity-verified' } } }); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it.each(['invalid', 'collision'] as const)('a generated %s local identifier cannot save an optional identity or touch the active read credential', async kind => {
    const h = fixture(); await h.addRead(); const active = structuredClone(h.values.get(SESSION_KEY)); h.resetCalls(); h.namedPorts.identifier.mockReturnValue(kind === 'invalid' ? 'Bad' : 'session-1');
    expect(await h.add('issues-write', 1)).toEqual({ state: 'unavailable' }); expect(h.writes()).toHaveLength(0); expect(h.values.get(SESSION_KEY)).toEqual(active);
});
it('an identifier callback that synchronously revokes sessions cannot let its verified candidate revive protected state', async () => {
    const h = fixture(); h.namedPorts.identifier.mockImplementation(() => { void h.connections.revokeAll(); return 'candidate'; });
    expect(await h.add('issues-write', 0)).toEqual({ state: 'stale' }); await vi.waitFor(() => expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false)); expect(h.writes()).toHaveLength(0);
});
it('an external read-credential epoch change after optional GET verification but before vault persistence retires the old authority', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); h.namedPorts.protected.mockResolvedValueOnce(true).mockImplementationOnce(async () => { await h.service.revoke(); return true; });
    expect(await h.add('issues-write', 1)).toEqual({ state: 'stale' }); expect(h.reader.read).toHaveBeenCalledTimes(2); expect(h.writes()).toHaveLength(0);
});
it('a read-credential epoch change during optional selection preflight cannot use the still-current editor as replacement authority', async () => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); h.resetCalls(); const get = vi.mocked(h.port.get).getMockImplementation()!; let nativeReads = 0;
    vi.mocked(h.port.get).mockImplementation(async key => { const result = await get(key); if (key === NAMED_SESSIONS_KEY && ++nativeReads === 2) await h.service.revoke(); return result; });
    expect(await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current)).toEqual({ state: 'stale' }); expect(h.writes()).toHaveLength(0);
});
it('an external credential retirement during the first native inspection prevents optional provider reads altogether', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); h.namedPorts.protected.mockImplementationOnce(async () => { await h.service.revoke(); return true; });
    expect(await h.add('issues-write', 1)).toEqual({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.writes()).toHaveLength(0);
});
it('a credential retirement after an accepted optional save retains the actual native effect without certifying its identity', async () => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); h.resetCalls(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await set(key, value); if (key === NAMED_SESSIONS_KEY) await h.service.revoke(); });
    expect(await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current)).toEqual({ state: 'stale' }); expect(h.writes()).toHaveLength(1);
    expect(await h.read()).toMatchObject({ revision: 3, connected: false, optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-2' } } });
});
it('a credential retirement while saving the read repository preference cannot retain the old verified read identity in the named vault', async () => {
    const h = fixture(); h.namedPorts.connected.mockImplementationOnce(async () => { await h.service.revoke(); });
    expect(await h.addRead()).toEqual({ state: 'stale' }); expect(h.writes()).toHaveLength(0); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('retiring read credentials inside optional-removal observation cannot let an obsolete controller delete that named identity', async () => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); h.resetCalls(); const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    expect(await h.connections.change({ type: 'remove', id: 'session-2' }, 2, h.current, () => { void h.service.revoke(); return null; })).toEqual({ state: 'stale' });
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect(h.writes()).toHaveLength(0); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('cleanup from a retired read operation cannot disconnect an independently established newer account', async () => {
    const h = fixture(); let replacementEpoch = 0;
    h.namedPorts.connected.mockImplementationOnce(async () => {
        vi.mocked(h.reader.read).mockImplementation(async request => ({ ...requestResult(request), data: request.type === 'viewer' ? { id: '2', login: 'new-account' } : { id: '8', name: 'other/repo' } }));
        await h.service.connect('synthetic_other_read_credential', 'other/repo'); replacementEpoch = h.service.status().epoch;
    });
    expect(await h.addRead()).toEqual({ state: 'stale' }); expect(h.writes()).toHaveLength(0);
    expect(h.service.status()).toEqual({ state: 'connected', epoch: replacementEpoch }); expect(h.service.verifiedIdentity()).toMatchObject({ viewerId: '2', repositoryId: '8' });
    expect(h.values.get(SESSION_KEY)).toMatchObject({ secret: 'synthetic_other_read_credential', viewerId: '2', repositoryId: '8' });
});
