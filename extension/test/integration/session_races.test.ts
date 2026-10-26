import { expect, it, vi } from 'vitest';
import type { ScheduledRead } from '../../src/application/read_scheduler.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { sessionHarness, CONNECTED, deferred, requestResult } from '../fixtures/runtime.ts';

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
