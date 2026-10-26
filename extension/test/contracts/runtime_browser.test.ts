import { afterEach, expect, it, vi } from 'vitest';
import { BrowserStorage } from '../../src/adapters/browser/storage.ts';
import { browserApi } from '../../src/adapters/browser/api.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

afterEach(() => vi.unstubAllGlobals());
it('github-browser-extension-runtime-C19/github-browser-extension-runtime-C22 protects session access where supported and works with Firefox/Safari restricted defaults without newer APIs', async () => {
    const h = browserFixture(); const storage = new BrowserStorage(h.area);
    expect(await storage.protect()).toBe(true); expect(h.area.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    await storage.set('key', { nonsecret: 1 }); expect(await storage.get('key')).toEqual({ nonsecret: 1 });
    await storage.remove('key'); expect(await storage.get('key')).toBe(undefined);
    delete h.area.setAccessLevel; expect(await storage.protect()).toBe(true);
    const absent = new BrowserStorage(undefined); expect(await absent.protect()).toBe(false);
    for (const operation of [() => absent.get('key'), () => absent.set('key', 'value'), () => absent.remove('key')]) await expect(operation()).rejects.toThrow('storage-unavailable');
});
it('github-browser-extension-runtime-C22/github-browser-extension-runtime-C38 feature-detects vendor API and absence without assuming setAccessLevel/getKeys or keepalive', () => {
    const h = browserFixture(); vi.stubGlobal('chrome', undefined); vi.stubGlobal('browser', undefined); expect(browserApi()).toBe(undefined);
    vi.stubGlobal('chrome', h.api); expect(browserApi()).toBe(h.api);
    const firefox = browserFixture().api; vi.stubGlobal('browser', firefox); expect(browserApi()).toBe(firefox);
});
it('github-browser-extension-runtime-C12 registers all background wake listeners synchronously, dispatches a closed response and cleans up every listener', async () => {
    const h = browserFixture(); const stop = startBackground(h.api);
    expect(h.onMessage.listeners.size).toBe(1); expect(h.onUpdated.listeners.size).toBe(1);
    expect(h.permissionRemoved.listeners.size).toBe(1); expect(h.area.get).not.toHaveBeenCalled();
    const respond = vi.fn(); const listener = [...h.onMessage.listeners][0];
    expect(listener(null, {}, respond)).toBe(true); await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ state: 'rejected', sourceTree: 'unbundled' }));
    stop(); expect(h.onMessage.listeners.size).toBe(0); expect(h.onUpdated.listeners.size).toBe(0);
    expect(h.onRemoved.listeners.size).toBe(0); expect(h.changed.listeners.size).toBe(0); expect(h.clicked.listeners.size).toBe(0);
});
it('github-browser-extension-runtime-C16 invalidates work on exact permission revocation and settings change; irrelevant events do nothing', async () => {
    const h = browserFixture(); vi.mocked(h.api.tabs.query).mockResolvedValue([{ id: 1 }, {}, { id: 2 }]);
    vi.mocked(h.api.tabs.sendMessage).mockRejectedValue(new Error('tab gone'));
    const stop = startBackground(h.api); const permission = [...h.permissionRemoved.listeners][0];
    permission({}); permission({ origins: ['https://other.invalid/*'] });
    const changed = [...h.changed.listeners][0]; changed({ unrelated: 1 }, 'local'); changed({ [SETTINGS_KEY]: 1 }, 'session');
    expect(h.api.tabs.query).not.toHaveBeenCalled();
    changed({ [SETTINGS_KEY]: 1 }, 'local'); permission({ origins: ['https://api.github.com/*'] }); permission({ origins: ['<all_urls>'] });
    await vi.waitFor(() => expect(h.api.tabs.sendMessage).toHaveBeenCalledTimes(6));
    for (const listener of h.onUpdated.listeners) { listener(1, {}); listener(1, { url: 'https://github.com/login' }); }
    for (const listener of h.onRemoved.listeners) listener(1);
    for (const listener of h.clicked.listeners) listener();
    expect(h.api.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test/runtime.html' }); stop();
});
it('background handles denied API access/private context and vanished-tab notification/open failures without logging raw provider data', async () => {
    const h = browserFixture(); h.api.extension = { inIncognitoContext: true };
    vi.mocked(h.api.tabs.query).mockRejectedValue(new Error('secret')); vi.mocked(h.api.tabs.create).mockRejectedValue(new Error('secret'));
    const stop = startBackground(h.api); const respond = vi.fn();
    [...h.onMessage.listeners][0]({ version: 1, method: 'session.status' }, { id: 'test', url: 'chrome-extension://test/runtime.html' }, respond);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(expect.objectContaining({ state: 'disconnected' })));
    for (const listener of h.clicked.listeners) listener(); stop();
    expect(h.api.permissions.contains).not.toHaveBeenCalled();
});

it('background composition executes the real settings/session/read ports with a credential-free response and offline tab activity', async () => {
    const h = browserFixture();
    const fetch = vi.fn(async (url: string) => {
        const data = url.endsWith('/user') ? { id: 1, login: 'octo' } : url.endsWith('/issues/42')
            ? { number: 42, title: 'fixture', state: 'open', html_url: 'https://github.com/octo/example/issues/42' }
            : { id: 7, full_name: 'octo/example' };
        const response = new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
        Object.defineProperty(response, 'url', { value: url }); return response;
    });
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('navigator', { onLine: false });
    const stop = startBackground(h.api); const listener = [...h.onMessage.listeners][0];
    const call = (value: unknown, sender = { id: 'test', url: 'chrome-extension://test/runtime.html' }) => new Promise<unknown>(resolve => listener(value, sender, resolve));
    expect(await call({ version: 1, method: 'session.connect', secret: 'synthetic_credential', repository: 'octo/example' })).toMatchObject({ state: 'connected' });
    const page = { version: 1, method: 'page.snapshot', route: 'https://github.com/octo/example/issues/42', generation: 1,
        repositoryId: '7', viewer: 'octo', visible: true, manual: true };
    const sender = { id: 'test', url: page.route, frameId: 0, tab: { id: 1, url: page.route, incognito: false } };
    expect(await call(page, sender)).toMatchObject({ state: 'inactive' });
    vi.stubGlobal('navigator', undefined); expect(await call({ ...page, generation: 2 }, sender)).toMatchObject({ state: 'current' });
    stop();
});
