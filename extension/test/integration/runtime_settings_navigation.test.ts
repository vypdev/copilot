import { afterEach, expect, it, vi } from 'vitest';
import { mountRuntimePanel } from '../../src/adapters/dom/runtime_panel.ts';
import { BrowserResourceScope } from '../../src/adapters/browser/resource_scope.ts';
import { runtimeCopy, statusText } from '../../src/presentation/runtime_copy.ts';
import { context, deferred } from '../fixtures/runtime.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { githubDom } from '../fixtures/dom.ts';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function panel() {
    const dom = githubDom(); cleanups.push(() => dom.dom.window.close()); const h = browserFixture();
    const registered = vi.spyOn(dom.dom.window.EventTarget.prototype, 'addEventListener');
    const scope = new BrowserResourceScope(() => true); cleanups.push(() => scope.dispose()); const copy = runtimeCopy('en');
    mountRuntimePanel(context(), scope, h.api, dom.document, copy, state => statusText(state, copy), () => ({ viewer: 'octo', repositoryId: '7' }));
    const button = dom.document.querySelector<HTMLButtonElement>('[data-copilot-open-settings]')!;
    const index = registered.mock.contexts.findIndex((target, index) => target === button && registered.mock.calls[index][0] === 'click');
    const listener = registered.mock.calls[index][1] as (event: MouseEvent) => void;
    // This is an orchestration fake; native receipts use genuine WebDriver pointer clicks.
    const trustedClick = () => listener({ isTrusted: true } as MouseEvent);
    return { ...dom, ...h, scope, button, trustedClick, status: dom.document.querySelector('[role=status]')! };
}
it('settings uses an accessible local action and ignores page-script synthetic clicks', () => {
    const h = panel(); expect(h.button.type).toBe('button'); expect(h.button.textContent).toBe('Runtime settings');
    expect(h.document.querySelector('[data-copilot-runtime] a')).toBe(null);
    h.button.click(); expect(h.api.runtime.sendMessage).not.toHaveBeenCalled();
});
it('trusted settings gestures send only the closed method and suppress double-click tab fanout while pending', async () => {
    const h = panel(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(pending.promise);
    h.trustedClick(); h.trustedClick(); expect(h.button.disabled).toBe(true);
    expect(h.api.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({ version: 1, method: 'settings.open' });
    pending.resolve({ state: 'opened' }); await vi.waitFor(() => expect(h.button.disabled).toBe(false));
    expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.status.textContent).not.toContain('unavailable');
});
it.each([null, {}, { state: 'rejected' }])('a malformed/rejected settings result %j is recoverable and contains no provider output', async value => {
    const h = panel(); vi.mocked(h.api.runtime.sendMessage).mockResolvedValueOnce(value); h.trustedClick();
    await vi.waitFor(() => expect(h.button.disabled).toBe(false)); expect(h.status.textContent).toContain('unavailable');
});
it('disposed settings controls discard late failures and queued gestures', async () => {
    const h = panel(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(pending.promise);
    h.trustedClick(); h.scope.dispose(); pending.reject(new Error('private')); h.trustedClick(); await Promise.resolve();
    expect(h.document.querySelector('[data-copilot-runtime]')).toBe(null); expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(1);
});
it('an old failed settings action cannot erase the result of a newer activity read', async () => {
    const h = panel(); const pending = deferred<unknown>(); vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce({ state: 'current', data: { title: 'Current native activity' } });
    h.trustedClick(); h.document.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(h.status.textContent).toContain('refreshed'));
    pending.reject(new Error('private')); await vi.waitFor(() => expect(h.button.disabled).toBe(false));
    expect(h.status.textContent).toContain('refreshed'); expect(h.document.body.textContent).not.toContain('private');
});
it('coexisting DOM interference cannot let an obsolete settings response complete a newer operation', async () => {
    const h = panel(); const older = deferred<unknown>(); const newer = deferred<unknown>();
    vi.mocked(h.api.runtime.sendMessage).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    h.trustedClick(); h.button.disabled = false; h.trustedClick();
    older.reject(new Error('private')); await Promise.resolve(); await Promise.resolve();
    expect(h.button.disabled).toBe(true); expect(h.status.textContent).not.toContain('unavailable');
    newer.resolve({ state: 'opened' }); await vi.waitFor(() => expect(h.button.disabled).toBe(false));
});

it('a synchronously invalidated browser context restores settings controls without leaking the native exception', () => {
    const h = panel(); vi.mocked(h.api.runtime.sendMessage).mockImplementationOnce(() => { throw new Error('private-context-invalidated'); });
    expect(h.trustedClick).not.toThrow(); expect(h.button.disabled).toBe(false); expect(h.status.textContent).toContain('unavailable');
    expect(h.document.body.textContent).not.toContain('private-context-invalidated');
});
