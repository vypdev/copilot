import { afterEach, expect, it, vi } from 'vitest';
import * as panelAdapter from '../../src/adapters/dom/runtime_panel.ts';
import * as shortcutAdapter from '../../src/adapters/dom/shortcuts.ts';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { configurationReply } from '../fixtures/page_configuration.ts';
import { githubDom } from '../fixtures/dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { BrowserApi } from '../../src/adapters/browser/api.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import { FeatureRuntime } from '../../src/application/lifecycle.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); });
function content(configure: (api: BrowserApi) => void = () => undefined) {
    const dom = githubDom(); stops.push(() => dom.dom.window.close()); const native = browserFixture();
    vi.mocked(native.api.runtime.sendMessage).mockImplementation(async request => configurationReply(request, {
        ...DEFAULT_SETTINGS, shortcuts: true, features: { 'BEX-CENTER-07': true },
        center: { ...DEFAULT_SETTINGS.center, bindings: [{ command: 'open-help', binding: 'Alt+Shift+H' }] },
    }));
    configure(native.api); const stop = startContent(native.api, dom.window, dom.document)!; stops.push(stop); return { ...dom, ...native, stop };
}
function peek(h: ReturnType<typeof content>, value: unknown = { version: 1, method: 'runtime.health' }, sender: Sender = { id: 'test' }) {
    const respond = vi.fn(); [...h.onMessage.listeners][0](value, sender, respond); return respond;
}
it('a runtime-panel mount exception cannot block the independently enabled native shortcut adapter', async () => {
    vi.spyOn(panelAdapter, 'mountRuntimePanel').mockImplementationOnce(() => { throw new Error('private-adapter-error'); });
    const mount = vi.spyOn(shortcutAdapter, 'mountShortcuts'); const h = content();
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    const scope = mount.mock.calls[0][1]; expect(scope.current()).toBe(true);
    h.window.dispatchEvent(new h.dom.window.Event('turbo:render')); await Promise.resolve();
    expect(scope.current()).toBe(true); expect(mount).toHaveBeenCalledOnce();
    expect(h.document.body.textContent).not.toContain('private-adapter-error');
});
it('a runtime-panel refresh exception releases only that panel and keeps the live shortcut scope mounted', async () => {
    const panel = vi.spyOn(panelAdapter, 'mountRuntimePanel'); const shortcuts = vi.spyOn(shortcutAdapter, 'mountShortcuts'); const h = content();
    await vi.waitFor(() => expect(shortcuts).toHaveBeenCalledOnce());
    const controller = panel.mock.results[0].value; const scope = shortcuts.mock.calls[0][1];
    const refresh = vi.spyOn(controller, 'refresh').mockImplementationOnce(() => { throw new Error('private-refresh-error'); });
    h.window.dispatchEvent(new h.dom.window.Event('turbo:render')); await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    h.window.dispatchEvent(new h.dom.window.Event('turbo:render')); await Promise.resolve();
    expect(scope.current()).toBe(true); expect(shortcuts).toHaveBeenCalledOnce();
    expect(h.document.body.textContent).not.toContain('private-refresh-error');
});
it('a native readonly health query has a closed empty snapshot, separate from proof that all registered product features work', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    const sends = vi.mocked(h.api.runtime.sendMessage).mock.calls.length; const response = peek(h);
    expect(response).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'ready', health: { blocked: [], events: [] } });
    expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(sends); expect(h.api.permissions.request).not.toHaveBeenCalled();
    expect(h.localArea.get).not.toHaveBeenCalled(); expect(h.sessionArea.get).not.toHaveBeenCalled();
});
it('the closed health reason quarantines only the failed panel, does not retry on page hints and never retains raw provider or page data', async () => {
    const panel = vi.spyOn(panelAdapter, 'mountRuntimePanel').mockImplementationOnce(() => { throw new Error('private-error-token'); });
    const shortcuts = vi.spyOn(shortcutAdapter, 'mountShortcuts'); const h = content(); await vi.waitFor(() => expect(shortcuts).toHaveBeenCalledOnce());
    for (let i = 0; i < 10; i++) h.window.dispatchEvent(new h.dom.window.Event('turbo:render')); await Promise.resolve();
    expect(panel).toHaveBeenCalledOnce(); expect(shortcuts.mock.calls[0][1].current()).toBe(true);
    const value = peek(h).mock.calls[0][0]; expect(value).toEqual({ sourceTree: 'unbundled', state: 'ready', health: {
        blocked: ['runtime-health'], events: [{ featureId: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' }] } });
    expect(JSON.stringify(value)).not.toMatch(/octo|example|https:|private|token|viewer|repository|draft/iu);
});
it('a failing shortcut adapter leaves the independently mounted panel and configuration available', async () => {
    vi.spyOn(shortcutAdapter, 'mountShortcuts').mockImplementationOnce(() => { throw new Error('private-shortcut-native'); });
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'ready', health: {
        blocked: ['center-shortcuts'], events: [{ featureId: 'center-shortcuts', code: 'mount-failed', scope: 'active-at-observation' }] } });
    expect(h.document.querySelector<HTMLElement>('[data-copilot-runtime]')?.dataset.copilotSettings).toBe('ready');
});
it('fresh native invalidation resets quarantine only after the source-bound configuration lease is replaced', async () => {
    const panel = vi.spyOn(panelAdapter, 'mountRuntimePanel').mockImplementationOnce(() => { throw new Error('private'); });
    const h = content(); await vi.waitFor(() => expect(panel).toHaveBeenCalledOnce());
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined);
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' });
    await vi.waitFor(() => expect(panel).toHaveBeenCalledTimes(2));
    expect(peek(h).mock.calls[0][0]).toEqual({ sourceTree: 'unbundled', state: 'ready', health: { blocked: [],
        events: [{ featureId: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' }] } });
});
it('an invalid configuration reply cannot release a helper quarantine; only a subsequent verified lease can retry it', async () => {
    const panel = vi.spyOn(panelAdapter, 'mountRuntimePanel').mockImplementationOnce(() => { throw new Error('private'); });
    const updates = vi.spyOn(FeatureRuntime.prototype, 'update'); const h = content(); await vi.waitFor(() => expect(panel).toHaveBeenCalledOnce());
    const send = vi.mocked(h.api.runtime.sendMessage).getMockImplementation()!;
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(request => (request as { method: string }).method === 'page.configuration' ? Promise.resolve(null) : send(request));
    const before = updates.mock.calls.length;
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined);
    await vi.waitFor(() => expect(updates).toHaveBeenCalledTimes(before + 1)); expect(panel).toHaveBeenCalledOnce();
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' });
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(send);
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined);
    await vi.waitFor(() => expect(panel).toHaveBeenCalledTimes(2)); expect(peek(h).mock.calls[0][0].state).toBe('ready');
});
it('foreign and content-script senders cannot request a diagnostic snapshot or invalidate current ownership', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    for (const sender of [{ id: 'foreign' }, { id: 'test', tab: { id: 9 } }]) expect(peek(h, undefined, sender)).not.toHaveBeenCalled();
    expect(peek(h).mock.calls[0][0].state).toBe('ready');
});
it('malformed, expanded and future diagnostic requests remain inert without disclosing a snapshot', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    for (const value of [null, { version: 2, method: 'runtime.health' }, { version: 1, method: 'runtime.health', url: 'private' },
        { version: 1 }, { version: 1, method: 'unsupported' }]) expect(peek(h, value)).not.toHaveBeenCalled();
    expect(peek(h).mock.calls[0][0].state).toBe('ready');
});
it('an unobserved pending configuration is unavailable rather than a fabricated zero-failure health result', async () => {
    const wait = deferred<unknown>(); const h = content(api => { vi.mocked(api.runtime.sendMessage).mockImplementation(() => wait.promise); });
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' }); h.stop(); wait.resolve(null); await Promise.resolve();
});
it('hidden contexts disclose no retained snapshot and the readonly query cannot resume page work', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    vi.spyOn(h.document, 'visibilityState', 'get').mockReturnValue('hidden'); const queries = vi.spyOn(h.document, 'querySelector');
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' }); expect(queries).not.toHaveBeenCalled();
});
it('a protected destination is unavailable before inspecting its metadata or reusing old diagnostic facts', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    h.window.history.pushState({}, '', '/settings/tokens'); const queries = vi.spyOn(h.document, 'querySelector');
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' }); expect(queries).not.toHaveBeenCalled();
});
it('a native identity change makes the old health observation unavailable before the reconciliation observer runs', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    h.document.querySelector('meta[name="user-login"]')!.setAttribute('content', 'another-account');
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' });
});
it('failed native context inspection stays unavailable and never escapes as an exception or disables another helper', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    const visible = vi.spyOn(h.document, 'visibilityState', 'get').mockImplementation(() => { throw new Error('private-native'); });
    expect(peek(h)).toHaveBeenCalledExactlyOnceWith({ sourceTree: 'unbundled', state: 'unavailable' }); visible.mockRestore();
    expect(peek(h).mock.calls[0][0].state).toBe('ready');
});
it('a throwing response receiver is invoked at most once and cannot change configuration or feature liveness', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    const reply = vi.fn(() => { throw new Error('private-receiver'); }); const listener = [...h.onMessage.listeners][0];
    expect(() => listener({ version: 1, method: 'runtime.health' }, { id: 'test' }, reply)).not.toThrow(); expect(reply).toHaveBeenCalledOnce();
    expect(peek(h).mock.calls[0][0].state).toBe('ready');
});
it('disposed native listeners reject queued queries before touching a retired document or delivering a second snapshot', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-runtime]')).not.toBeNull());
    const listener = [...h.onMessage.listeners][0]; h.stop(); const queries = vi.spyOn(h.document, 'querySelector'); const reply = vi.fn();
    listener({ version: 1, method: 'runtime.health' }, { id: 'test' }, reply); expect(reply).not.toHaveBeenCalled(); expect(queries).not.toHaveBeenCalled();
});
it('a cleanup error during document teardown cannot resurrect diagnostic collection, prevent remaining cleanup or escape to native UI', async () => {
    const panel = vi.spyOn(panelAdapter, 'mountRuntimePanel'); const h = content(); await vi.waitFor(() => expect(panel).toHaveBeenCalledOnce());
    const cleanup = vi.spyOn(panel.mock.results[0].value, 'dispose').mockImplementationOnce(() => { throw new Error('private-teardown'); });
    const listener = [...h.onMessage.listeners][0]; expect(() => h.stop()).not.toThrow(); expect(cleanup).toHaveBeenCalledOnce();
    expect(h.document.querySelector('[data-copilot-runtime]')).toBeNull(); const response = vi.fn();
    listener({ version: 1, method: 'runtime.health' }, { id: 'test' }, response); expect(response).not.toHaveBeenCalled();
    expect(h.document.body.textContent).not.toContain('private-teardown');
});
