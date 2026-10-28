import { afterEach, expect, it, vi } from 'vitest';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { browserFixture } from '../fixtures/browser.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import { PAGE } from '../fixtures/runtime.ts';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function background() {
    const h = browserFixture(); let pending: AbortSignal | undefined;
    const response = (url: string, data: unknown) => {
        const result = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
        Object.defineProperty(result, 'url', { value: url }); return result;
    };
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/issues/42')) {
            pending = init!.signal as AbortSignal;
            return new Promise<Response>(resolve => pending!.addEventListener('abort', () => resolve(response(url, {})), { once: true }));
        }
        return response(url, url.endsWith('/user') ? { id: 1, login: 'octo' } : { id: 7, full_name: 'octo/example' });
    }));
    const stop = startBackground(h.api); const listener = [...h.onMessage.listeners][0];
    const call = (message: unknown, sender: Sender = { id: 'test', url: 'chrome-extension://test/runtime.html' }) => new Promise<unknown>(resolve => listener(message, sender, resolve));
    return { ...h, call, stop, pending: () => pending };
}
it.each([
    ['protected route', { url: 'https://github.com/settings/tokens' }],
    ['eligible route', { url: 'https://github.com/octo/example/pull/42' }],
    ['same-URL reload', { status: 'loading' }],
])('github-browser-extension-runtime-C08/C14 native tab %s cancels the background owner before any late response', async (_name, changes) => {
    const h = background();
    try {
        expect(await h.call({ version: 1, method: 'session.connect', secret: 'synthetic_marker', repository: 'octo/example' })).toMatchObject({ state: 'connected' });
        const read = h.call(PAGE, { id: 'test', url: PAGE.route, frameId: 0, tab: { id: 1, url: PAGE.route, incognito: false } });
        await vi.waitFor(() => expect(h.pending()).toBeDefined());
        for (const update of h.onUpdated.listeners) update(2, changes);
        expect(h.pending()!.aborted).toBe(false);
        for (const update of h.onUpdated.listeners) update(1, { status: 'complete' });
        expect(h.pending()!.aborted).toBe(false);
        for (const update of h.onUpdated.listeners) update(1, changes);
        expect(h.pending()!.aborted).toBe(true); expect(await read).toMatchObject({ state: 'stale' });
    } finally { h.stop(); }
});
it('github-browser-extension-runtime-C19/C31 real composition confines the synthetic credential and scheduler to session storage and preferences to local storage', async () => {
    const h = background();
    try {
        expect(h.localArea).not.toBe(h.sessionArea); expect(h.localValues).not.toBe(h.sessionValues);
        expect(await h.call({ version: 1, method: 'session.connect', secret: 'synthetic_marker', repository: 'octo/example' })).toMatchObject({ state: 'connected' });
        expect(h.sessionArea.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
        expect(h.localArea.setAccessLevel).not.toHaveBeenCalled();
        expect(h.sessionValues.get(SESSION_KEY)).toMatchObject({ secret: 'synthetic_marker' });
        expect(h.sessionValues.has(SETTINGS_KEY)).toBe(false); expect(h.localValues.has(SESSION_KEY)).toBe(false);
        expect([...h.localValues.keys()]).toEqual([SETTINGS_KEY]);
        expect(JSON.stringify([...h.localValues])).not.toContain('synthetic_marker');
        expect(h.localValues.get(SETTINGS_KEY)).toMatchObject({ current: { repositories: { '7': { connected: true } } } });
    } finally { h.stop(); }
});
