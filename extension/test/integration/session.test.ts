import { expect, it, vi } from 'vitest';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { sessionHarness, CONNECTED, PAGE, deferred } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

it('github-browser-extension-runtime-C17/github-browser-extension-runtime-C31 connects with canonical native identity and keeps secrets only behind the protected session port', async () => {
    const h = sessionHarness(); const result = await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    expect(result.state).toBe('connected'); expect(JSON.stringify(result)).not.toContain(CONNECTED.secret);
    expect(h.service.selectedRepositoryId()).toBe('7'); expect(h.values.get(SESSION_KEY)).toEqual(CONNECTED);
    const snapshot = await h.service.snapshot(PAGE, true, true, new BrowserCancellation());
    expect(snapshot).toMatchObject({ state: 'current', generation: 1, data: { kind: 'issue', number: 42 } });
    expect(JSON.stringify(snapshot)).not.toContain(CONNECTED.secret);
});
it('github-browser-extension-runtime-C11/github-browser-extension-runtime-C15 invalidates and aborts before protected storage deletion; late private results cannot repopulate it', async () => {
    const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const snapshot = h.service.snapshot(PAGE, true, true, new BrowserCancellation()); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(3));
    const before = h.service.status().epoch; const removal = deferred<void>(); vi.mocked(h.port.remove).mockImplementationOnce(() => removal.promise);
    const revoke = h.service.revoke(); expect(h.service.status()).toEqual({ state: 'disconnected', epoch: before + 1 });
    pending.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 });
    expect(await snapshot).toMatchObject({ state: 'disconnected' }); removal.resolve(); await revoke;
    expect(h.service.selectedRepositoryId()).toBe('');
});
it('github-browser-extension-runtime-C15/github-browser-extension-runtime-C16 observed logout, changed viewer or API-site revocation clears local session without claiming PAT revocation', async () => {
    for (const condition of ['logout', 'viewer', 'permission']) {
        const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
        if (condition === 'permission') h.ports.permitted.mockResolvedValue(false);
        const result = await h.service.snapshot({ ...PAGE, viewer: condition === 'logout' ? null : condition === 'viewer' ? 'other' : 'octo' }, true, true, new BrowserCancellation());
        expect(result).toMatchObject({ state: 'disconnected' }); expect(h.values.has(SESSION_KEY)).toBe(false);
        expect(h.reader.read).toHaveBeenCalledTimes(2);
    }
});
it('github-browser-extension-runtime-C12 restores through protected session plus fresh permission/viewer/repository revalidation, with no keepalive', async () => {
    const h = sessionHarness(); h.values.set(SESSION_KEY, CONNECTED); await h.service.start();
    expect(h.service.status().state).toBe('connected'); expect(h.reader.read).toHaveBeenCalledTimes(2);
    await h.service.start(); expect(h.reader.read).toHaveBeenCalledTimes(2);
    const noStore = sessionHarness(); noStore.ports.protected.mockResolvedValue(false); await noStore.service.start();
    expect(noStore.service.status().state).toBe('disconnected'); expect(noStore.reader.read).not.toHaveBeenCalled();
    const noPermission = sessionHarness(); noPermission.ports.permitted.mockResolvedValue(false); await noPermission.service.start();
    expect(noPermission.reader.read).not.toHaveBeenCalled();
});
it('github-browser-extension-runtime-C12 rejects restored foreign identity or damaged session rather than silently continuing another account', async () => {
    for (const stored of [{ ...CONNECTED, viewerId: '2' }, { ...CONNECTED, repositoryId: '8' }, { schemaVersion: 99 }]) {
        const h = sessionHarness(); h.values.set(SESSION_KEY, stored); await h.service.start();
        expect(h.service.status().state).not.toBe('connected'); expect(h.values.has(SESSION_KEY)).toBe(false);
    }
});
it('github-browser-extension-runtime-C19 protected storage, permission, identity and persistence failures expose only a safe unavailable state', async () => {
    for (const failure of ['protect', 'permission', 'read', 'viewer', 'repository', 'write', 'remove']) {
        const h = sessionHarness();
        if (failure === 'protect') h.ports.protected.mockRejectedValue(new Error('private'));
        if (failure === 'permission') h.ports.permitted.mockResolvedValue(false);
        if (failure === 'read') vi.mocked(h.port.get).mockRejectedValue(new Error('private'));
        if (failure === 'viewer') vi.mocked(h.reader.read).mockResolvedValue({ state: 'denied', bytes: 0 });
        if (failure === 'repository') vi.mocked(h.reader.read).mockImplementation(async request => request.type === 'viewer'
            ? { state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 } : { state: 'invalid', bytes: 0 });
        if (failure === 'write') vi.mocked(h.port.set).mockRejectedValue(new Error('private'));
        if (failure === 'remove') { await h.service.start(); vi.mocked(h.port.remove).mockRejectedValue(new Error('private')); await h.service.revoke(); }
        else expect(JSON.stringify(await h.service.connect(CONNECTED.secret, CONNECTED.repository))).not.toContain('private');
        expect(h.service.status().state).toBe('unavailable');
    }
});
it('github-browser-extension-runtime-C11 account revoke during Connect cannot commit an old credential after a late provider result', async () => {
    const h = sessionHarness(); await h.service.start(); const pending = deferred<ReadResult>();
    vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const connect = h.service.connect(CONNECTED.secret, CONNECTED.repository); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    await h.service.revoke(); pending.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 }); await connect;
    expect(h.service.status().state).not.toBe('connected'); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('github-browser-extension-runtime-C11 permission-await races cannot resurrect revoked sessions or issue reads using the old account', async () => {
    const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    const permission = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(permission.promise);
    const reads = vi.mocked(h.reader.read).mock.calls.length; const snapshot = h.service.snapshot(PAGE, true, true, new BrowserCancellation());
    await Promise.resolve(); await h.service.revoke(); permission.resolve(true);
    expect(await snapshot).toMatchObject({ state: 'disconnected' }); expect(h.reader.read).toHaveBeenCalledTimes(reads);
});
it('github-browser-extension-runtime-C08 page cancellation and foreign repository/unsupported page cannot expose another selected target', async () => {
    const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    for (const message of [{ ...PAGE, repositoryId: '8' }, { ...PAGE, route: 'https://github.com/other/repo/issues/42' },
        { ...PAGE, route: 'https://github.com/octo/example' }, { ...PAGE, route: 'https://github.com/login' }]) {
        expect(await h.service.snapshot(message, true, true, new BrowserCancellation())).not.toMatchObject({ state: 'current' });
    }
    const cancellation = new BrowserCancellation(); cancellation.abort();
    expect(await h.service.snapshot(PAGE, true, true, cancellation)).toMatchObject({ state: 'aborted' });
});
it('github-browser-extension-runtime-C16 clears unauthorized credentials but retains explicit denied/offline/cooldown outcomes without inventing evidence', async () => {
    for (const state of ['unauthorized', 'denied', 'offline'] as const) {
        const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
        vi.mocked(h.reader.read).mockResolvedValueOnce({ state, bytes: 0 });
        expect(await h.service.snapshot(PAGE, true, true, new BrowserCancellation())).toMatchObject({ state: state === 'unauthorized' ? 'disconnected' : state });
        if (state === 'unauthorized') expect(h.values.has(SESSION_KEY)).toBe(false);
    }
});

it('github-browser-extension-runtime-C16/C23 preserves nonsecret wait deadlines for Connect and page reads and clears them on disconnect', async () => {
    for (const phase of ['viewer', 'repository']) {
        const h = sessionHarness();
        if (phase === 'repository') vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 });
        vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'limited', retryAfter: 120, bytes: 0 });
        expect(await h.service.connect(CONNECTED.secret, CONNECTED.repository)).toMatchObject({ state: 'limited', retryAt: 220000 });
        expect(h.values.has(SESSION_KEY)).toBe(false); await h.service.revoke(); expect(h.service.status()).not.toHaveProperty('retryAt');
    }
    const h = sessionHarness(); await h.service.connect(CONNECTED.secret, CONNECTED.repository);
    vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'limited', retryAfter: 120, bytes: 0 });
    expect(await h.service.snapshot(PAGE, true, true, new BrowserCancellation())).toMatchObject({ state: 'limited', retryAt: 220000 });
});
