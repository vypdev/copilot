import { afterEach, expect, it, vi } from 'vitest';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { centerIdentifier } from '../../src/infrastructure/center_runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { CONNECTED } from '../fixtures/runtime.ts';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
    const h = browserFixture(); const stop = startBackground(h.api); const listener = [...h.onMessage.listeners][0];
    const call = (value: unknown, sender = CENTER_SENDER) => new Promise<Record<string, unknown>>(resolve => {
        listener({ version: 1, ...value as object }, sender, result => resolve(result as Record<string, unknown>));
    });
    return { ...h, stop, call };
}
it('native background composition owns cryptographic client/operation IDs and persists an observed center transaction', async () => {
    const h = fixture();
    const client = await h.call({ method: 'center.open' }); expect(client).toMatchObject({ role: 'editor', state: 'ready', sourceTree: 'unbundled' });
    expect(client.clientId).toMatch(/^[0-9a-f]{32}$/u);
    expect(await h.call({ method: 'center.read', clientId: client.clientId })).toMatchObject({ loaded: { state: 'ready' } });
    const preview = await h.call({ method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, clientId: client.clientId, controllerEpoch: client.controllerEpoch,
        intent: { type: 'preferences', values: { locale: 'es' } } });
    expect(preview.operationId).toMatch(/^[0-9a-f]{32}$/u); expect(preview.operationId).not.toBe(client.clientId);
    expect(await h.call({ method: 'center.confirm', credentialEpoch: 0, clientId: client.clientId, controllerEpoch: client.controllerEpoch,
        operationId: preview.operationId, expectedRevision: preview.revision })).toMatchObject({ state: 'committed', current: true });
    expect(h.localValues.get(SETTINGS_KEY)).toMatchObject({ current: { locale: 'es', revision: 1 }, operation: { id: preview.operationId } });
    expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.sessionArea.get).not.toHaveBeenCalled(); h.stop();
});
it('safe packaged hash navigation retains ownership, while reload, departure and native tab removal retire it', async () => {
    const h = fixture(); const first = await h.call({ method: 'center.open' });
    const updated = [...h.onUpdated.listeners][0]; updated(1, { url: 'chrome-extension://test/runtime.html#/profiles', status: 'complete' });
    expect(await h.call({ method: 'center.read', clientId: first.clientId })).toMatchObject({ role: 'editor' });
    updated(1, { status: 'loading' }); expect(await h.call({ method: 'center.read', clientId: first.clientId })).toMatchObject({ state: 'stale' });
    const second = await h.call({ method: 'center.open' }); updated(1, { url: 'https://github.com/' });
    expect(await h.call({ method: 'center.read', clientId: second.clientId })).toMatchObject({ state: 'stale' });
    const third = await h.call({ method: 'center.open' }); [...h.onRemoved.listeners][0](1);
    expect(await h.call({ method: 'center.read', clientId: third.clientId })).toMatchObject({ state: 'stale' }); h.stop();
});
it('credential permission revocation fences an outstanding center preview without granting or writing settings', async () => {
    const h = fixture(); const client = await h.call({ method: 'center.open' });
    const preview = await h.call({ method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, clientId: client.clientId, controllerEpoch: client.controllerEpoch,
        intent: { type: 'preferences', values: { paused: true } } });
    [...h.permissionRemoved.listeners][0]({ origins: ['https://api.github.com/*'] });
    expect(await h.call({ method: 'center.confirm', credentialEpoch: 0, clientId: client.clientId, controllerEpoch: client.controllerEpoch,
        operationId: preview.operationId, expectedRevision: preview.revision })).toMatchObject({ state: 'stale' });
    expect(h.localArea.set).not.toHaveBeenCalled(); h.stop();
});
it('native private contexts and missing cryptographic capability cannot obtain an editor', async () => {
    const h = fixture(); h.api.extension = { inIncognitoContext: true };
    expect(await h.call({ method: 'center.open' })).toMatchObject({ state: 'unavailable' }); h.stop();
    const other = fixture(); delete other.api.extension; vi.stubGlobal('crypto', undefined);
    expect(await other.call({ method: 'center.open' })).toMatchObject({ state: 'unavailable' }); other.stop();
});
it('authority identifier encoding retains leading zeroes and uses native random bytes without a fallback', () => {
    const random = vi.fn((value: Uint8Array) => { value.set([0, 1, 10, 15, 16, 255]); return value; });
    vi.stubGlobal('crypto', { getRandomValues: random });
    const id = centerIdentifier(); expect(id).toBe(`00010a0f10ff${'00'.repeat(10)}`); expect(id).toHaveLength(32); expect(random).toHaveBeenCalledTimes(1);
});
it('missing foreground receivers cannot reject a native ownership transition or leak a notification error', async () => {
    const h = fixture(); vi.mocked(h.api.runtime.sendMessage).mockRejectedValue(new Error('no-receiver'));
    expect(await h.call({ method: 'center.open' })).toMatchObject({ state: 'ready', role: 'editor' });
    await Promise.resolve(); expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.invalidated' }); h.stop();
});
it('native permission revocation contains failed protected cleanup and never reports retained credentials as a usable connection', async () => {
    const h = fixture(); h.sessionValues.set(SESSION_KEY, CONNECTED); h.sessionValues.set(NAMED_SESSIONS_KEY, { schemaVersion: 99 });
    vi.mocked(h.sessionArea.remove).mockRejectedValue(new Error('private protected cleanup'));
    [...h.permissionRemoved.listeners][0]({ origins: ['https://api.github.com/*'] });
    await vi.waitFor(() => expect(h.sessionArea.remove).toHaveBeenCalledWith(NAMED_SESSIONS_KEY));
    await vi.waitFor(async () => expect(await h.call({ method: 'session.status' })).toMatchObject({ state: 'unavailable' }));
    expect(h.sessionValues.has(SESSION_KEY)).toBe(true); expect(h.localArea.set).not.toHaveBeenCalled(); h.stop();
});
