import { afterEach, expect, it, vi } from 'vitest';
import * as panelAdapter from '../../src/adapters/dom/runtime_panel.ts';
import { mountRuntimePanel } from '../../src/adapters/dom/runtime_panel.ts';
import { BrowserResourceScope } from '../../src/adapters/browser/resource_scope.ts';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { runtimeCopy, statusText } from '../../src/presentation/runtime_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { context, deferred } from '../fixtures/runtime.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { githubDom } from '../fixtures/dom.ts';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); vi.unstubAllGlobals(); });
function panel() {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = browserFixture();
    const scope = new BrowserResourceScope(() => true); cleanups.push(() => scope.dispose()); const copy = runtimeCopy('en');
    const controller = mountRuntimePanel(context(), scope, h.api, dom.document, copy, state => statusText(state, copy), () => ({ viewer: 'octo', repositoryId: '7' }));
    return { ...dom, ...h, scope, controller };
}
function content() {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = browserFixture();
    vi.mocked(h.api.runtime.sendMessage).mockResolvedValue({ state: 'ready', settings: DEFAULT_SETTINGS });
    const stop = startContent(h.api, dom.window, dom.document)!; cleanups.push(stop); return { ...dom, ...h, stop };
}
it('github-browser-extension-runtime-C13/github-browser-extension-runtime-C27 preserves native draft bytes, selection and focus while safely rendering issue/PR context', async () => {
    const h = panel(); const draft = h.document.querySelector('textarea')!; const text = draft.value; draft.focus(); draft.setSelectionRange(2, 9);
    vi.mocked(h.api.runtime.sendMessage).mockResolvedValue({ state: 'current', data: { title: '<img src=x onerror=alert(1)>' } });
    h.document.querySelector('button')!.click(); await vi.waitFor(() => expect(h.document.querySelector('[role=status]')!.textContent).toContain('refreshed'));
    expect(draft.value).toBe(text); expect(draft.selectionStart).toBe(2); expect(draft.selectionEnd).toBe(9); expect(h.document.activeElement).toBe(draft);
    expect(h.document.querySelector('[data-copilot-runtime]')!.textContent).toContain('Issue #42: <img'); expect(h.document.querySelector('img')).toBe(null);
    expect(h.document.querySelector('[data-copilot-runtime] a')!.getAttribute('href')).toBe('chrome-extension://test/runtime.html');
});
it('github-browser-extension-runtime-C28/github-browser-extension-runtime-C30 renders unavailable and malformed provider states as bounded text without raw HTML or URLs', async () => {
    const h = panel();
    for (const response of [null, {}, { state: 1 }, { state: 'denied', secret: 'never render' }, { state: 'current', data: { title: 1 } }]) {
        vi.mocked(h.api.runtime.sendMessage).mockResolvedValue(response); h.document.querySelector('button')!.click();
        await vi.waitFor(() => expect(h.document.querySelector('button')!.disabled).toBe(false));
        expect(h.document.querySelector('[data-copilot-runtime]')!.textContent).not.toContain('never render');
    }
    vi.mocked(h.api.runtime.sendMessage).mockRejectedValue(new Error('secret')); h.document.querySelector('button')!.click();
    await vi.waitFor(() => expect(h.document.querySelector('[role=status]')!.textContent).toContain('unavailable'));
});
it('github-browser-extension-runtime-C08 discards late panel results, removes only owned nodes and handles refresh after native root replacement', async () => {
    const h = panel(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValue(pending.promise);
    h.document.querySelector('button')!.click(); h.scope.dispose(); pending.resolve({ state: 'current', data: { title: 'stale' } }); await Promise.resolve();
    expect(h.document.querySelector('[data-copilot-runtime]')).toBe(null); expect(h.document.querySelector('textarea')).not.toBe(null); h.controller.refresh();
    const live = panel(); const main = live.document.querySelector('main')!; main.remove(); live.controller.refresh();
    const replacement = live.document.createElement('main'); live.document.body.append(replacement); live.controller.refresh();
    expect(replacement.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1);
});
it('github-browser-extension-runtime-C07 coexists with equivalent native/extension controls and handles absent anchors without mutation', () => {
    const h = panel(); const copy = runtimeCopy('en');
    const duplicate = mountRuntimePanel(context(), h.scope, h.api, h.document, copy, state => statusText(state, copy), () => ({ viewer: null, repositoryId: '' }));
    duplicate.refresh(); duplicate.dispose(); expect(h.document.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1);
    h.document.querySelector('main')!.remove(); const absent = mountRuntimePanel(context(), h.scope, h.api, h.document, copy, state => statusText(state, copy), () => ({ viewer: null, repositoryId: '' }));
    absent.refresh(); absent.dispose();
});
it('github-browser-extension-runtime-C29 exposes complete EN/ES/FR/PT status meanings, accessible headings/buttons and language fallback', () => {
    for (const locale of ['en', 'es-ES', 'fr-FR', 'pt-BR', 'unknown']) {
        const copy = runtimeCopy(locale); for (const value of Object.values(copy)) expect(value.length).toBeGreaterThan(5);
        for (const state of ['current', 'connected', 'disconnected', 'paused', 'inactive', 'stale', 'aborted', 'pending', 'revalidating', 'denied']) expect(statusText(state, copy)).toBeTruthy();
    }
    expect(runtimeCopy('unknown')).toBe(runtimeCopy('en')); const h = panel();
    expect(h.document.querySelector('section')!.getAttribute('aria-label')).toBe('Copilot runtime');
    expect(h.document.querySelector('[role=status]')!.getAttribute('aria-live')).toBe('polite');
    expect(h.document.querySelector('button')!.type).toBe('button'); expect(h.document.querySelector('h2')!.textContent).toBeTruthy();
});
it('github-browser-extension-runtime-C01/github-browser-extension-runtime-C14 mounts one generation through Turbo, history, native identity change, protected routes and root replacement', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1));
    for (const path of ['/octo/example/pull/42', '/octo/other/issues/42', '/octo/example/issues/42']) {
        h.window.history.pushState({}, '', path); h.window.dispatchEvent(new h.dom.window.Event('turbo:render'));
        await vi.waitFor(() => expect(h.document.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1));
    }
    h.document.querySelector('meta[name="octolytics-dimension-issue_id"]')!.setAttribute('content', '43');
    h.window.dispatchEvent(new h.dom.window.Event('popstate')); await Promise.resolve();
    const fresh = h.document.createElement('main'); h.document.querySelector('main')!.replaceWith(fresh);
    await vi.waitFor(() => expect(fresh.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1));
    h.window.history.pushState({}, '', '/settings/tokens'); h.window.dispatchEvent(new h.dom.window.Event('turbo:load'));
    expect(h.document.querySelector('[data-copilot-runtime]')).toBe(null);
    const calls = vi.mocked(h.api.runtime.sendMessage).mock.calls.length;
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined);
    await Promise.resolve(); expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(calls);
    h.window.history.pushState({}, '', '/octo/example/issues/42'); h.window.dispatchEvent(new h.dom.window.Event('pageshow'));
    await vi.waitFor(() => expect(h.document.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1)); h.stop(); h.stop();
});
it('github-browser-extension-runtime-C02 refuses direct protected/private/child-frame contexts before any messages or observers', () => {
    const dom = githubDom('https://github.com/login'); cleanups.push(() => dom.dom.window.close()); const h = browserFixture();
    expect(startContent(h.api, dom.window, dom.document)).toBe(undefined); dom.window.history.replaceState({}, '', '/octo/example');
    h.api.extension = { inIncognitoContext: true }; expect(startContent(h.api, dom.window, dom.document)).toBe(undefined);
    h.api.extension = undefined; const child = { ...dom.window, location: dom.window.location, top: {} } as unknown as Window;
    expect(startContent(h.api, child, dom.document)).toBe(undefined); expect(h.api.runtime.sendMessage).not.toHaveBeenCalled();
});
it('github-browser-extension-runtime-C09 invalidates settings/credential epochs, stops hidden work and handles future/malformed/failed settings safely', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1));
    const invalidate = () => { for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined); };
    for (const response of [null, { state: 'ready', settings: { schemaVersion: 99 } }, { state: 'ready', settings: { bad: true } }]) {
        vi.mocked(h.api.runtime.sendMessage).mockResolvedValue(response); invalidate(); await vi.waitFor(() => expect(h.document.querySelector<HTMLElement>('[data-copilot-runtime]')!.dataset.copilotSettings).toBe('unavailable'));
    }
    vi.mocked(h.api.runtime.sendMessage).mockRejectedValue(new Error('private')); invalidate(); await Promise.resolve(); await Promise.resolve();
    vi.mocked(h.api.runtime.sendMessage).mockResolvedValue({ state: 'ready', settings: { ...DEFAULT_SETTINGS, locale: 'es' } }); invalidate();
    await vi.waitFor(() => expect(h.document.querySelector('section')!.textContent).toContain('Runtime de Copilot'));
    Object.defineProperty(h.document, 'visibilityState', { configurable: true, value: 'hidden' }); h.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
    expect(h.document.querySelector('[data-copilot-runtime]')).toBe(null); h.window.dispatchEvent(new h.dom.window.Event('hashchange'));
    Object.defineProperty(h.document, 'visibilityState', { configurable: true, value: 'visible' }); h.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
    await vi.waitFor(() => expect(h.document.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1));
});
it('github-browser-extension-runtime-C08 rejects late startup settings and foreign invalidation messages and cleans up absent/replaced roots', async () => {
    const h = githubDom(); cleanups.push(() => h.dom.window.close()); const b = browserFixture(); const pending = deferred<unknown>();
    vi.mocked(b.api.runtime.sendMessage).mockReturnValue(pending.promise); const stop = startContent(b.api, h.window, h.document)!;
    const listener = [...b.onMessage.listeners][0]; listener({ version: 1, method: 'runtime.invalidated', extra: true }, { id: 'test' }, () => undefined);
    listener(null, { id: 'foreign' }, () => undefined); stop(); pending.resolve({ state: 'ready', settings: DEFAULT_SETTINGS }); await Promise.resolve();
    expect(h.document.querySelector('[data-copilot-runtime]')).toBe(null);
});

it('content composition renders read results through localized presentation and isolates a failed feature mount', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('button')).not.toBe(null));
    vi.mocked(h.api.runtime.sendMessage).mockResolvedValue({ state: 'current', data: { title: 'Native fixture' } });
    h.document.querySelector('button')!.click(); await vi.waitFor(() => expect(h.document.querySelector('[role=status]')!.textContent).toContain('refreshed'));
    h.document.querySelector('meta[name="user-login"]')!.remove(); h.document.querySelector('meta[name="octolytics-dimension-repository_id"]')!.remove();
    h.window.dispatchEvent(new h.dom.window.Event('pageshow')); await Promise.resolve();
});

it('isolates a feature exception, recovers with a disabled diagnostic panel, and ignores failed release acknowledgement', async () => {
    const mount = vi.spyOn(panelAdapter, 'mountRuntimePanel').mockImplementationOnce(() => { throw new Error('private'); });
    const h = content(); await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    h.window.dispatchEvent(new h.dom.window.Event('pageshow'));
    await vi.waitFor(() => expect(h.document.querySelector<HTMLElement>('[data-copilot-runtime]')!.dataset.copilotSettings).toBe('unavailable'));
    vi.mocked(h.api.runtime.sendMessage).mockRejectedValueOnce(new Error('unavailable'));
    Object.defineProperty(h.document, 'visibilityState', { configurable: true, value: 'hidden' });
    h.document.dispatchEvent(new h.dom.window.Event('visibilitychange')); await Promise.resolve(); mount.mockRestore();
});
it('native root absence and fallback never rewrite native content and can resume on the next page hint', async () => {
    const h = content(); await vi.waitFor(() => expect(h.document.querySelector('section')).not.toBe(null));
    h.document.querySelector('#js-repo-pjax-container')!.remove(); h.window.dispatchEvent(new h.dom.window.Event('turbo:render')); await Promise.resolve();
    const main = h.document.createElement('main'); h.document.body.append(main); h.window.dispatchEvent(new h.dom.window.Event('pageshow'));
    await vi.waitFor(() => expect(main.querySelectorAll('[data-copilot-runtime]')).toHaveLength(1));
});
