import { expect, it, vi } from 'vitest';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { CONNECTED, deferred, requestResult, sessionHarness } from '../fixtures/runtime.ts';

it('an acknowledged active-session save without canonical persistence cannot become a verified connection', async () => {
    const f = sessionHarness(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (key, value) => { if (key !== SESSION_KEY) await set(key, value); });
    expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'unavailable' });
    expect(f.service.verifiedIdentity()).toBeNull(); expect(f.values.has(SESSION_KEY)).toBe(false);
});
it('an exactly persisted active session survives a lost native acknowledgement without another save', async () => {
    const f = sessionHarness(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (key, value) => { await set(key, value); if (key === SESSION_KEY) throw new Error('private acknowledgement failure'); });
    expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'connected' });
    expect(f.service.verifiedIdentity()).toMatchObject({ viewerId: CONNECTED.viewerId });
    expect(vi.mocked(f.port.set).mock.calls.filter(([key]) => key === SESSION_KEY)).toHaveLength(1);
});
it('acknowledged deletion that leaves a protected credential behind remains unavailable', async () => {
    const f = sessionHarness(); await f.service.connect(CONNECTED.secret, CONNECTED.repository);
    const remove = vi.mocked(f.port.remove).getMockImplementation()!;
    vi.mocked(f.port.remove).mockImplementation(async key => { if (key !== SESSION_KEY) await remove(key); });
    await f.service.revoke(); expect(f.service.status().state).toBe('unavailable');
    expect(f.service.verifiedIdentity()).toBeNull(); expect(f.values.has(SESSION_KEY)).toBe(true);
});
it('canonical absence establishes deletion after its acknowledgement is lost without another removal', async () => {
    const f = sessionHarness(); await f.service.connect(CONNECTED.secret, CONNECTED.repository);
    const remove = vi.mocked(f.port.remove).getMockImplementation()!; vi.mocked(f.port.remove).mockClear();
    vi.mocked(f.port.remove).mockImplementation(async key => { await remove(key); if (key === SESSION_KEY) throw new Error('private acknowledgement failure'); });
    await f.service.revoke(); expect(f.service.status().state).toBe('disconnected'); expect(f.values.has(SESSION_KEY)).toBe(false);
    expect(vi.mocked(f.port.remove).mock.calls.filter(([key]) => key === SESSION_KEY)).toHaveLength(1);
});
it('a different validated stored identity cannot establish the candidate connection', async () => {
    const f = sessionHarness(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (key, value) => { await set(key, key === SESSION_KEY ? { ...value as object, viewerId: '2' } : value); });
    expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'unavailable' }); expect(f.service.verifiedIdentity()).toBeNull();
});
it('a failed canonical save inspection cannot publish identity or retry the protected save', async () => {
    const f = sessionHarness(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (key, value) => { await set(key, value); if (key === SESSION_KEY) vi.mocked(f.port.get).mockRejectedValueOnce(new Error('private read')); });
    expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'unavailable' }); expect(f.service.verifiedIdentity()).toBeNull();
    expect(vi.mocked(f.port.set).mock.calls.filter(([key]) => key === SESSION_KEY)).toHaveLength(1);
});
it('a failed canonical removal inspection cannot report verified disconnected storage', async () => {
    const f = sessionHarness(); await f.service.connect(CONNECTED.secret, CONNECTED.repository);
    vi.mocked(f.port.get).mockRejectedValueOnce(new Error('private read')); await f.service.revoke();
    expect(f.service.status().state).toBe('unavailable'); expect(f.service.verifiedIdentity()).toBeNull(); expect(f.values.has(SESSION_KEY)).toBe(false);
});
it('a null protected record is not canonical absence after a removal', async () => {
    const f = sessionHarness(); await f.service.start(); f.values.set(SESSION_KEY, null);
    vi.mocked(f.port.remove).mockResolvedValueOnce(undefined); await f.service.revoke(); expect(f.service.status().state).toBe('unavailable');
});
it('revocation during delayed canonical save readback prevents publication and serializes deletion after that inspection', async () => {
    const f = sessionHarness(); await f.service.start(); const read = vi.mocked(f.port.get).getMockImplementation()!; const begun = deferred<void>(); const gate = deferred<unknown>();
    vi.mocked(f.port.get).mockImplementation(async key => { const value = await read(key); if (key === SESSION_KEY && value) { begun.resolve(); return gate.promise; } return value; });
    const connecting = f.service.connect(CONNECTED.secret, CONNECTED.repository); await begun.promise;
    expect(f.service.verifiedIdentity()).toBeNull(); const removal = f.service.revoke(); gate.resolve(CONNECTED); await Promise.all([connecting, removal]);
    expect(f.service.status().state).toBe('disconnected'); expect(f.values.has(SESSION_KEY)).toBe(false);
});
it('current-source loss during canonical save inspection removes the candidate without publishing it', async () => {
    const f = sessionHarness(); await f.service.start(); let live = true; const read = vi.mocked(f.port.get).getMockImplementation()!;
    vi.mocked(f.port.get).mockImplementation(async key => { const value = await read(key); if (key === SESSION_KEY && value) live = false; return value; });
    expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository, undefined, () => live)).toMatchObject({ state: 'disconnected' });
    expect(f.service.verifiedIdentity()).toBeNull(); expect(f.values.has(SESSION_KEY)).toBe(false);
});
it('a source-fence failure in queued persistence cannot write a credential or wedge later cleanup and reconnection', async () => {
    const f = sessionHarness(); await f.service.start(); let verified = false; let checks = 0;
    const run = vi.spyOn(f.scheduler, 'run').mockImplementation(async (_key, _repository, request) => {
        if (request.type === 'repository') verified = true; return requestResult(request);
    });
    const current = () => { if (verified && ++checks === 2) throw new Error('private source-fence failure'); return true; };
    expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository, undefined, current)).toMatchObject({ state: 'unavailable' });
    expect(f.port.set).not.toHaveBeenCalledWith(SESSION_KEY, expect.anything()); expect(f.service.verifiedIdentity()).toBeNull();
    run.mockRestore(); expect(await f.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'connected' });
});
it('cold explicit revocation cannot silently restore a retained credential after an unconfirmed removal', async () => {
    const f = sessionHarness(); f.values.set(SESSION_KEY, CONNECTED); vi.mocked(f.port.remove).mockRejectedValue(new Error('private'));
    await f.service.revoke(); expect(f.service.status().state).toBe('unavailable'); await f.service.start();
    expect(f.reader.read).not.toHaveBeenCalled(); expect(f.service.verifiedIdentity()).toBeNull(); expect(f.values.has(SESSION_KEY)).toBe(true);
});
it('a scoped restoration cannot become retryable after explicit revocation interrupts its provider read', async () => {
    const f = sessionHarness(); f.values.set(SESSION_KEY, CONNECTED); const gate = deferred<Awaited<ReturnType<typeof f.reader.read>>>(); vi.mocked(f.reader.read).mockReturnValueOnce(gate.promise);
    const restoring = f.service.start({ current: () => true, cancellation: f.ports.cancellation() }); await vi.waitFor(() => expect(f.reader.read).toHaveBeenCalledOnce()); await f.service.revoke();
    gate.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, bytes: 1, etag: '' }); await restoring;
    f.values.set(SESSION_KEY, CONNECTED); await f.service.start({ current: () => true, cancellation: f.ports.cancellation() }); expect(f.reader.read).toHaveBeenCalledOnce(); expect(f.service.verifiedIdentity()).toBeNull();
});
