import { afterEach, expect, it, vi } from 'vitest';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { githubDom } from '../fixtures/dom.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { configurationReply, scopedSettings, CONFIG, pageSender } from '../fixtures/page_configuration.ts';
import { CONNECTED, deferred } from '../fixtures/runtime.ts';
import { record } from '../../src/domain/value.ts';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const panel = (document: Document) => document.querySelector<HTMLElement>('[data-copilot-runtime]');
it('actual background/center/content composition applies verified density and drops it immediately on native account change', async () => {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = backgroundCenterFixture(); cleanups.push(h.stop);
    const client = await h.client(); await client.connections({ type: 'connect', name: 'Work', secret: CONNECTED.secret, repository: CONNECTED.repository }, 0);
    h.localValues.set(SETTINGS_KEY, scopedSettings());
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(message => h.call(message, pageSender));
    const stop = startContent(h.api, dom.window, dom.document)!; cleanups.push(stop);
    await vi.waitFor(() => expect(panel(dom.document)?.dataset.copilotDensity).toBe('compact'));
    expect(panel(dom.document)!.style.padding).toBe('0.5rem'); const providerCalls = h.provider.mock.calls.length;
    dom.document.querySelector<HTMLMetaElement>('meta[name="user-login"]')!.content = 'other';
    await vi.waitFor(() => expect(panel(dom.document)?.dataset.copilotDensity).toBe('comfortable'));
    expect(h.provider).toHaveBeenCalledTimes(providerCalls);
    expect(dom.document.body.textContent).not.toContain('Private profile name');
    expect(dom.document.querySelector('textarea')!.value).toContain('draft');
});
it('a real selected profile pause removes runtime effects, resumes only after a reviewed preference change, and never performs HTTP', async () => {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = backgroundCenterFixture(); cleanups.push(h.stop);
    h.localValues.set(SETTINGS_KEY, { ...scopedSettings(true), paused: true });
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(message => h.call(message, pageSender));
    const stop = startContent(h.api, dom.window, dom.document)!; cleanups.push(stop);
    await vi.waitFor(() => expect(h.localArea.get).toHaveBeenCalled()); await Promise.resolve(); expect(panel(dom.document)).toBe(null);
    expect(h.provider).not.toHaveBeenCalled();
    // Model the durable result of the independently tested reviewed center commit.
    h.localValues.set(SETTINGS_KEY, { ...scopedSettings(), revision: 1 });
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined);
    await vi.waitFor(() => expect(panel(dom.document)?.dataset.copilotSettings).toBe('ready')); expect(h.provider).not.toHaveBeenCalled();
});
it('SPA, identity and hidden-page transitions discard delayed receipts before any stale feature can mount', async () => {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = browserFixture(); const requests: { request: unknown; pending: ReturnType<typeof deferred<unknown>> }[] = [];
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(message => {
        if (record(message) && message.method === 'page.release') return Promise.resolve({ state: 'released' });
        const pending = deferred<unknown>(); requests.push({ request: message, pending }); return pending.promise;
    });
    const stop = startContent(h.api, dom.window, dom.document)!; cleanups.push(stop);
    dom.window.history.pushState({}, '', '/octo/other/issues/42'); dom.window.dispatchEvent(new dom.dom.window.Event('turbo:load'));
    expect(requests).toHaveLength(2); requests[0].pending.resolve(configurationReply(requests[0].request)); await Promise.resolve(); expect(panel(dom.document)).toBe(null);
    requests[1].pending.resolve(configurationReply(requests[1].request)); await vi.waitFor(() => expect(panel(dom.document)).not.toBe(null));
    dom.document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_id"]')!.content = '8';
    await vi.waitFor(() => expect(requests).toHaveLength(3)); expect(panel(dom.document)).toBe(null);
    Object.defineProperty(dom.document, 'visibilityState', { configurable: true, value: 'hidden' }); dom.document.dispatchEvent(new dom.dom.window.Event('visibilitychange'));
    requests[2].pending.resolve(configurationReply(requests[2].request)); await Promise.resolve(); expect(panel(dom.document)).toBe(null);
});
it('foreign sources and page-origin invalidations cannot activate or reload a configuration', async () => {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = browserFixture();
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async request => ({ ...configurationReply(request), sourceTree: 'foreign' }));
    const stop = startContent(h.api, dom.window, dom.document)!; cleanups.push(stop);
    await vi.waitFor(() => expect(panel(dom.document)?.dataset.copilotSettings).toBe('unavailable'));
    const calls = vi.mocked(h.api.runtime.sendMessage).mock.calls.length;
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, pageSender, () => undefined);
    expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(calls); expect(dom.document.querySelector('button')!.disabled).toBe(true);
});
it('native tab activation cancels a cold restoration and removes the background wake listener on shutdown', async () => {
    const h = browserFixture(); h.localValues.set(SETTINGS_KEY, scopedSettings()); h.sessionValues.set(SESSION_KEY, CONNECTED);
    const pending = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => { signal = init.signal as AbortSignal; return pending.promise; }));
    const stop = startBackground(h.api); cleanups.push(stop); const message = [...h.onMessage.listeners][0];
    const response = new Promise<unknown>(resolve => message(CONFIG, pageSender, resolve)); await vi.waitFor(() => expect(signal).toBeDefined());
    for (const listener of h.onActivated.listeners) listener({ tabId: 2, windowId: 1 }); expect(signal!.aborted).toBe(true);
    pending.resolve(new Response('{}')); expect(await response).toMatchObject({ state: 'stale' });
    expect(h.sessionValues.has(SESSION_KEY)).toBe(true); stop(); expect(h.onActivated.listeners.size).toBe(0);
});

it.each(['light', 'dark'] as const)('effective %s appearance changes only the extension-owned native control scheme', async theme => {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = browserFixture();
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async request => configurationReply(request, { ...scopedSettings(), theme }));
    const stop = startContent(h.api, dom.window, dom.document)!; cleanups.push(stop);
    await vi.waitFor(() => expect(panel(dom.document)?.style.colorScheme).toBe(theme));
    expect(dom.document.documentElement.style.colorScheme).toBe(''); expect(dom.document.querySelector('textarea')!.style.colorScheme).toBe('');
});
it('a failed native credential removal after site permission revocation cannot produce an unhandled rejection or current read authority', async () => {
    const h = browserFixture(); vi.mocked(h.sessionArea.remove).mockRejectedValue(new Error('private unavailable store'));
    const stop = startBackground(h.api); cleanups.push(stop);
    for (const listener of h.permissionRemoved.listeners) listener({ origins: ['https://api.github.com/*'] });
    await vi.waitFor(() => expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.invalidated' }));
    const listener = [...h.onMessage.listeners][0]; const result = new Promise<unknown>(resolve => listener(CONFIG, pageSender, resolve));
    expect(await result).toMatchObject({ state: 'ready', connected: false });
});
