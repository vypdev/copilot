import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { startOptions } from '../../src/infrastructure/options_runtime.ts';
import { RUNTIME_HTML } from '../../tooling/static_assets.mts';
import { browserFixture } from '../fixtures/browser.ts';
import { deferred } from '../fixtures/runtime.ts';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); vi.unstubAllGlobals(); });
function options(sourceTree?: string) {
    const dom = new JSDOM(RUNTIME_HTML); cleanups.push(() => dom.window.close()); const h = browserFixture();
    if (sourceTree) dom.window.document.documentElement.dataset.copilotSourceTree = sourceTree;
    const stop = startOptions(h.api, dom.window.document, 'es-ES'); cleanups.push(stop);
    const document = dom.window.document;
    const secret = document.getElementById('credential') as HTMLInputElement;
    const repository = document.getElementById('repository') as HTMLInputElement;
    const form = document.getElementById('connection') as HTMLFormElement;
    const button = document.getElementById('connect') as HTMLButtonElement;
    const submit = () => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    return { ...h, dom, document, stop, secret, repository, button, submit };
}
it('github-browser-extension-runtime-C17/github-browser-extension-runtime-C29/github-browser-extension-runtime-C31 requests the optional exact API host only after explicit Connect and clears credential input before async work', async () => {
    const h = options('a'.repeat(64)); await Promise.resolve(); expect(h.document.getElementById('build-identity')!.textContent).toContain('a'.repeat(64)); expect(h.api.permissions.request).not.toHaveBeenCalled();
    h.secret.value = 'synthetic_marker'; h.repository.value = ' octo/example ';
    vi.mocked(h.api.runtime.sendMessage).mockResolvedValue({ state: 'connected' }); h.submit();
    expect(h.secret.value).toBe(''); expect(h.button.disabled).toBe(true);
    await vi.waitFor(() => expect(h.document.getElementById('status')!.dataset.state).toBe('connected'));
    expect(h.api.permissions.request).toHaveBeenCalledWith({ origins: ['https://api.github.com/*'] });
    expect(h.api.runtime.sendMessage).toHaveBeenLastCalledWith({ version: 1, method: 'session.connect', secret: 'synthetic_marker', repository: 'octo/example' });
    expect(h.document.documentElement.lang).toBe('es'); expect(h.document.body.textContent).not.toContain('synthetic_marker');
    expect(h.document.querySelector('label[for=credential]')).not.toBe(null);
    expect(h.secret.type).toBe('password'); expect(h.secret.autocomplete).toBe('off');
});
it('github-browser-extension-runtime-C28 denied grant leaves standalone settings and no credential-setting request; provider failures expose no raw text', async () => {
    const h = options(); await Promise.resolve(); vi.mocked(h.api.permissions.request).mockResolvedValue(false); h.submit();
    await vi.waitFor(() => expect(h.button.disabled).toBe(false)); expect(h.document.getElementById('status')!.textContent).toContain('denegado');
    expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(1);
    vi.mocked(h.api.permissions.request).mockRejectedValue(new Error('private')); h.submit();
    await vi.waitFor(() => expect(h.document.getElementById('status')!.dataset.state).toBe('unavailable'));
    expect(h.document.body.textContent).not.toContain('private');
});
it('github-browser-extension-runtime-C11 explicit disconnect wins over an older Connect result and retains no form credential', async () => {
    const h = options(); await Promise.resolve(); const pending = deferred<unknown>();
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async (value: unknown) => (value as { method: string }).method === 'session.connect' ? pending.promise : { state: 'disconnected' });
    h.secret.value = 'synthetic_marker'; h.submit(); await vi.waitFor(() => expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(2));
    (h.document.getElementById('disconnect') as HTMLButtonElement).click(); await vi.waitFor(() => expect(h.document.getElementById('status')!.dataset.state).toBe('disconnected'));
    pending.resolve({ state: 'connected' }); await Promise.resolve(); expect(h.secret.value).toBe('');
    expect(h.document.getElementById('status')!.dataset.state).toBe('disconnected');
});
it('github-browser-extension-runtime-C08/github-browser-extension-runtime-C28 disposal and malformed/failed status reads cannot render late data or keep credential-bearing controls active', async () => {
    const h = options(); await Promise.resolve(); const pending = deferred<boolean>(); vi.mocked(h.api.permissions.request).mockReturnValue(pending.promise);
    h.secret.value = 'synthetic_marker'; h.submit(); h.stop(); pending.resolve(false); await Promise.resolve();
    expect(h.secret.value).toBe('');
    const second = options(); await Promise.resolve(); vi.mocked(second.api.runtime.sendMessage).mockResolvedValue(null);
    (second.document.getElementById('disconnect') as HTMLButtonElement).click(); await vi.waitFor(() => expect(second.document.getElementById('status')!.dataset.state).toBe('unavailable'));
    vi.mocked(second.api.runtime.sendMessage).mockRejectedValue(new Error('secret'));
    (second.document.getElementById('disconnect') as HTMLButtonElement).click(); await Promise.resolve();
    expect(second.document.body.textContent).not.toContain('secret');
});
it('options startup failure uses complete unavailable state and disconnect/Connect completion after teardown cannot render', async () => {
    const h = browserFixture(); vi.mocked(h.api.runtime.sendMessage).mockRejectedValue(new Error('private'));
    const dom = new JSDOM(RUNTIME_HTML); cleanups.push(() => dom.window.close()); const stop = startOptions(h.api, dom.window.document, 'en'); cleanups.push(stop);
    await vi.waitFor(() => expect(dom.window.document.getElementById('status')!.dataset.state).toBe('unavailable'));
    const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValue(pending.promise);
    (dom.window.document.getElementById('disconnect') as HTMLButtonElement).click(); stop(); pending.resolve({ state: 'connected' }); await Promise.resolve();
    expect(dom.window.document.getElementById('status')!.dataset.state).toBe('unavailable');
});
it('packaged UI contains only local script, responsive semantics and no remote assets or inline script handlers', () => {
    const dom = new JSDOM(RUNTIME_HTML); cleanups.push(() => dom.window.close()); const document = dom.window.document;
    expect([...document.querySelectorAll('script')].map(script => script.getAttribute('src'))).toEqual(['runtime.js']);
    expect(document.querySelector('meta[name=viewport]')).not.toBe(null);
    expect(document.querySelector('[role=status]')!.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('[onclick]')).toBe(null); expect(RUNTIME_HTML).not.toMatch(/https?:\/\//u);
});

it('disconnect during a permission prompt cancels Connect even if the grant later succeeds', async () => {
    const h = options(); await Promise.resolve(); const pending = deferred<boolean>(); vi.mocked(h.api.permissions.request).mockReturnValue(pending.promise);
    h.secret.value = 'synthetic_marker'; h.submit();
    (h.document.getElementById('disconnect') as HTMLButtonElement).click(); await Promise.resolve(); pending.resolve(true); await Promise.resolve();
    expect(vi.mocked(h.api.runtime.sendMessage).mock.calls.some(([message]) => (message as { method: string }).method === 'session.connect')).toBe(false);
});
it('disposed and malformed startup/revoke/Connect results cannot expose provider errors or restore a stale connection', async () => {
    const h = browserFixture(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValue(pending.promise);
    const dom = new JSDOM(RUNTIME_HTML); cleanups.push(() => dom.window.close()); const stop = startOptions(h.api, dom.window.document, 'en');
    stop(); pending.reject(new Error('private')); await Promise.resolve(); expect(dom.window.document.body.textContent).not.toContain('private');
    const live = options(); await Promise.resolve(); vi.mocked(live.api.runtime.sendMessage).mockResolvedValue({ state: 3 });
    (live.document.getElementById('disconnect') as HTMLButtonElement).click(); await Promise.resolve();
    expect(live.document.getElementById('status')!.dataset.state).toBe('unavailable');
    const grant = deferred<boolean>(); vi.mocked(live.api.permissions.request).mockReturnValue(grant.promise); live.submit(); live.stop(); grant.resolve(true); await Promise.resolve();
});

it('late failing Connect/disconnect operations and startup completion cannot replace a newer explicit operation', async () => {
    for (const method of ['connect', 'disconnect']) {
        const h = options(); await Promise.resolve(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(pending.promise);
        if (method === 'connect') { h.submit(); await vi.waitFor(() => expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(2)); }
        else (h.document.getElementById('disconnect') as HTMLButtonElement).click();
        h.stop(); pending.reject(new Error('private')); await Promise.resolve(); expect(h.document.body.textContent).not.toContain('private');
    }
    const h = browserFixture(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(pending.promise).mockResolvedValue({ state: 'disconnected' });
    const dom = new JSDOM(RUNTIME_HTML); cleanups.push(() => dom.window.close()); cleanups.push(startOptions(h.api, dom.window.document, 'en'));
    (dom.window.document.getElementById('disconnect') as HTMLButtonElement).click(); await Promise.resolve(); pending.resolve({ state: 'connected' }); await Promise.resolve();
    expect(dom.window.document.getElementById('status')!.dataset.state).toBe('disconnected');
});

it('a rejected startup status cannot overwrite a successful explicit Connect completed after startup', async () => {
    const h = browserFixture(); const startup = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(startup.promise).mockResolvedValue({ state: 'connected' });
    const dom = new JSDOM(RUNTIME_HTML); cleanups.push(() => dom.window.close()); cleanups.push(startOptions(h.api, dom.window.document, 'en'));
    dom.window.document.getElementById('connection')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(dom.window.document.getElementById('status')!.dataset.state).toBe('connected'));
    startup.reject(new Error('private')); await Promise.resolve(); expect(dom.window.document.getElementById('status')!.dataset.state).toBe('connected');
});
