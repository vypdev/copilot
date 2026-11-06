import { expect, it, vi } from 'vitest';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import type { ScheduledRead } from '../../src/application/read_scheduler.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { sessionHarness, CONNECTED, PAGE, deferred, requestResult } from '../fixtures/runtime.ts';

it('revoke while protected restore is reading storage rejects both late values and late failures', async () => {
    for (const failure of [false, true]) {
        const h = sessionHarness(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
        const start = h.service.start(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalledTimes(1));
        await h.service.revoke();
        if (failure) pending.reject(new Error('private')); else pending.resolve(CONNECTED);
        await start; expect(h.service.status().state).toBe('disconnected'); expect(h.reader.read).not.toHaveBeenCalled();
    }
});
it('permission resolution after a concurrent revoke cannot begin a new Connect using the earlier credential', async () => {
    const h = sessionHarness(); await h.service.start(); const permission = deferred<boolean>();
    h.ports.permitted.mockReturnValueOnce(permission.promise);
    const connect = h.service.connect(CONNECTED.secret, CONNECTED.repository);
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(2));
    await h.service.revoke(); permission.resolve(true); await connect;
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.service.status().state).toBe('disconnected');
});
it('oversized combined Connect evidence cannot persist a selected identity even when both individual projections validate', async () => {
    const h = sessionHarness(); vi.mocked(h.reader.read).mockImplementation(async request => ({ ...requestResult(request), bytes: 600000 }));
    await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.service.selectedRepositoryId()).toBe('');
});
it('revoke queued between projection and protected persistence prevents even a transient stale secret write', async () => {
    const h = sessionHarness(); await h.service.start();
    const run = vi.spyOn(h.scheduler, 'run').mockImplementation(async (_key, _repository, request) => {
        if (request.type === 'repository') queueMicrotask(() => queueMicrotask(() => { void h.service.revoke(); }));
        return requestResult(request);
    });
    await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    expect(h.port.set).not.toHaveBeenCalledWith(SESSION_KEY, expect.anything()); expect(h.service.status().state).toBe('disconnected'); run.mockRestore();
});
it('permission withdrawn after the protected write removes the credential instead of leaving an unvalidated stored connection', async () => {
    const h = sessionHarness(); await h.service.start(); h.ports.permitted.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.service.status().state).toBe('disconnected');
});
it('late persisted rate-limit replies cannot overwrite a newer disconnected epoch or restore its credential', async () => {
    const h = sessionHarness(); await h.service.start(); const persisted = deferred<void>();
    vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'limited', retryAfter: 120, bytes: 0 });
    vi.mocked(h.port.set).mockResolvedValueOnce().mockReturnValueOnce(persisted.promise);
    const connect = h.service.connect(CONNECTED.secret, CONNECTED.repository);
    await vi.waitFor(() => expect(h.port.set).toHaveBeenCalledTimes(2)); await h.service.revoke(); persisted.resolve(); await connect;
    expect(h.service.status().state).toBe('disconnected'); expect(h.service.status()).not.toHaveProperty('retryAt');
});

it('the session epoch independently fences an obsolete scheduler completion even if its cancellation boundary returned a late limit', async () => {
    const h = sessionHarness(); await h.service.start(); const pending = deferred<ScheduledRead>();
    const run = vi.spyOn(h.scheduler, 'run').mockReturnValueOnce(pending.promise);
    const connect = h.service.connect(CONNECTED.secret, CONNECTED.repository); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await h.service.revoke(); pending.resolve({ state: 'limited', bytes: 0, retryAfter: 120, retryAt: 220000 }); await connect;
    expect(h.service.status().state).toBe('disconnected'); expect(h.service.status()).not.toHaveProperty('retryAt');
});

it('concurrent explicit Connect attempts cannot coalesce credentials or persist one account against another repository', async () => {
    const h = sessionHarness(); await h.service.start();
    vi.mocked(h.reader.read).mockImplementation(async (request, secret) => ({ state: 'ok', etag: '', bytes: 1,
        data: request.type === 'viewer' ? { id: secret === 'synthetic_second' ? '2' : '1', login: secret === 'synthetic_second' ? 'second' : 'first' }
            : { id: secret === 'synthetic_second' ? '9' : '7', name: request.type === 'repository' ? request.name : 'unexpected' } }));
    await Promise.all([h.service.connect('synthetic_first', 'octo/first'), h.service.connect('synthetic_second', 'octo/second')]);
    expect(h.values.get(SESSION_KEY)).toMatchObject({ secret: 'synthetic_second', viewerId: '2', viewerLogin: 'second', repositoryId: '9', repository: 'octo/second' });
    expect(vi.mocked(h.reader.read).mock.calls.map(([, secret]) => secret)).toEqual(['synthetic_second', 'synthetic_second']);
});
it('a denied permission result from an obsolete Connect cannot overwrite a newer successful connection', async () => {
    const h = sessionHarness(); await h.service.start(); const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const old = h.service.connect('synthetic_first', CONNECTED.repository); await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(2));
    expect(await h.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'connected' });
    permission.resolve(false); await old; expect(h.service.status().state).toBe('connected'); expect(h.values.get(SESSION_KEY)).toEqual(CONNECTED);
});

it.each([false, true])('an obsolete page permission result (%s) cannot revoke a newer connection', async allowed => {
    const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const page = h.service.snapshot({ ...PAGE, viewer: null }, true, true, new BrowserCancellation());
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(4));
    expect(await h.service.connect('synthetic_new_connection', CONNECTED.repository)).toMatchObject({ state: 'connected' });
    permission.resolve(allowed); expect(await page).toMatchObject({ state: 'disconnected' });
    expect(h.service.status().state).toBe('connected'); expect(h.values.get(SESSION_KEY)).toMatchObject({ secret: 'synthetic_new_connection' });
});
it('an obsolete failed revoke cannot overwrite a newer Connect state while its identity read is pending', async () => {
    const h = sessionHarness(); await h.service.start(); const removal = deferred<void>(); const identity = deferred<ScheduledRead>();
    vi.mocked(h.port.remove).mockReturnValueOnce(removal.promise);
    const older = h.service.revoke(); await vi.waitFor(() => expect(h.port.remove).toHaveBeenCalledTimes(2));
    const run = vi.spyOn(h.scheduler, 'run').mockReturnValueOnce(identity.promise); const newer = h.service.connect(CONNECTED.secret, CONNECTED.repository);
    await vi.waitFor(() => expect(h.service.status().epoch).toBe(3)); removal.reject(new Error('private')); await older;
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1)); expect(h.service.status().state).toBe('disconnected');
    identity.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, bytes: 1, etag: '' });
    expect(await newer).toMatchObject({ state: 'connected' });
});

it('a restoration requested from an already canceled scope performs no permission, storage or provider work', async () => {
    const h = sessionHarness(); const cancellation = new BrowserCancellation(); cancellation.abort();
    await h.service.start({ cancellation, current: () => true });
    expect(h.ports.protected).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a page departure while restoration checks native protection retains the credential without starting HTTP', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED); const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const cancellation = new BrowserCancellation(); const restore = h.service.start({ cancellation, current: () => true });
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(1)); cancellation.abort(); permission.resolve(true); await restore;
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.values.get(SESSION_KEY)).toEqual(CONNECTED); expect(h.service.status().state).toBe('disconnected');
});
it.each(['cancellation', 'scope replacement'] as const)('%s of one page preserves a joined restoration for another page', async retirement => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const viewer = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(viewer.promise);
    const firstCancellation = new BrowserCancellation(); let firstCurrent = true;
    const first = h.service.start({ cancellation: firstCancellation, current: () => firstCurrent });
    await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    const second = h.service.start({ cancellation: new BrowserCancellation(), current: () => true });
    if (retirement === 'cancellation') firstCancellation.abort(); else firstCurrent = false;
    viewer.resolve(requestResult({ type: 'viewer' }));
    await Promise.all([first, second]);
    expect(h.service.verifiedIdentity()).toMatchObject({ viewerId: '1', repositoryId: '7' });
    expect(vi.mocked(h.reader.read).mock.calls.map(([request]) => request.type)).toEqual(['viewer', 'repository']);
    expect(h.port.set).toHaveBeenCalledWith(SESSION_KEY, CONNECTED);
});
it('a still-current page starts restoration after the last earlier waiter cancels', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const cancellation = new BrowserCancellation();
    const first = h.service.start({ cancellation, current: () => true });
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(1)); cancellation.abort();
    const later = h.service.start({ cancellation: new BrowserCancellation(), current: () => true });
    permission.resolve(true);
    await Promise.all([first, later]);
    expect(h.service.verifiedIdentity()).toMatchObject({ viewerId: '1', repositoryId: '7' });
    expect(vi.mocked(h.reader.read).mock.calls.map(([request]) => request.type)).toEqual(['viewer', 'repository']);
});
it.each(['page cancellation', 'session revoke'] as const)('%s fences a newcomer waiting for an abandoned restoration to drain', async retirement => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const firstCancellation = new BrowserCancellation(); const laterCancellation = new BrowserCancellation();
    const first = h.service.start({ cancellation: firstCancellation, current: () => true });
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(1)); firstCancellation.abort();
    const later = h.service.start({ cancellation: laterCancellation, current: () => true });
    if (retirement === 'page cancellation') laterCancellation.abort(); else await h.service.revoke();
    permission.resolve(true);
    await Promise.all([first, later]);
    expect(h.reader.read).not.toHaveBeenCalled();
    expect(h.service.verifiedIdentity()).toBeNull();
    expect(h.values.has(SESSION_KEY)).toBe(retirement === 'page cancellation');
});
it('a reentrant native protection check joins the already reserved restoration', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const join = () => h.service.start({ cancellation: new BrowserCancellation(), current: () => true });
    let reentrant: Promise<void> | undefined;
    h.ports.protected.mockImplementationOnce(async () => { reentrant = join(); return true; });
    await join(); await reentrant;
    expect(h.ports.protected).toHaveBeenCalledOnce();
    expect(h.reader.read).toHaveBeenCalledTimes(2);
    expect(h.service.status().state).toBe('connected');
});
it('the last page can cancel a reserved restoration before it touches native protection', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const cancellation = new BrowserCancellation();
    const restoring = h.service.start({ cancellation, current: () => true });
    cancellation.abort(); await restoring;
    expect(h.ports.protected).not.toHaveBeenCalled();
    expect(h.reader.read).not.toHaveBeenCalled();
    expect(h.values.get(SESSION_KEY)).toEqual(CONNECTED);
});
it('synchronous revocation fences a reserved restoration before native work starts', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const restoring = h.service.start({ cancellation: new BrowserCancellation(), current: () => true });
    await Promise.all([restoring, h.service.revoke()]);
    expect(h.ports.protected).not.toHaveBeenCalled();
    expect(h.reader.read).not.toHaveBeenCalled();
    expect(h.service.status().state).toBe('disconnected');
    expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('a held restoration bounds scoped consumers and keeps its admitted transport shared', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const join = () => h.service.start({ cancellation: new BrowserCancellation(), current: () => true });
    const admitted = Array.from({ length: 128 }, join);
    await join();
    expect(h.reader.read).not.toHaveBeenCalled();
    permission.resolve(true);
    await Promise.all(admitted);
    await join();
    expect(h.service.verifiedIdentity()).toMatchObject({ viewerId: '1', repositoryId: '7' });
    expect(vi.mocked(h.reader.read).mock.calls.map(([request]) => request.type)).toEqual(['viewer', 'repository']);
});
it.each(['cancellation', 'scope replacement'] as const)('%s during the final restore permission check fences activation', async retirement => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED);
    const permission = deferred<boolean>(); const cancellation = new BrowserCancellation(); let current = true;
    h.ports.permitted.mockResolvedValueOnce(true).mockReturnValueOnce(permission.promise);
    const restore = h.service.start({ cancellation, current: () => current });
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalledTimes(2));
    expect(h.port.set).toHaveBeenCalledWith(SESSION_KEY, CONNECTED);
    if (retirement === 'cancellation') cancellation.abort(); else current = false;
    permission.resolve(true); await restore;
    expect(h.service.verifiedIdentity()).toBeNull();
    expect(h.service.status().state).toBe('disconnected');
    expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('an obsolete rejected Connect transport cannot change the state after an independent revocation', async () => {
    const h = sessionHarness(); await h.service.start(); const pending = deferred<ScheduledRead>(); const run = vi.spyOn(h.scheduler, 'run').mockReturnValueOnce(pending.promise);
    const connect = h.service.connect(CONNECTED.secret, CONNECTED.repository); await vi.waitFor(() => expect(run).toHaveBeenCalled());
    await h.service.revoke(); pending.reject(new Error('private adapter failure')); await connect;
    expect(h.service.status().state).toBe('disconnected'); expect(h.values.has(SESSION_KEY)).toBe(false);
});
