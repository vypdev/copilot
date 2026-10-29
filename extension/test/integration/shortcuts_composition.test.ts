import { afterEach, expect, it, vi } from 'vitest';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { shortcutsCopy } from '../../src/domain/shortcuts_copy.ts';
import { githubDom } from '../fixtures/dom.ts';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { pageSender } from '../fixtures/page_configuration.ts';
import { record } from '../../src/domain/value.ts';
import * as shortcutAdapter from '../../src/adapters/dom/shortcuts.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const settings = { ...DEFAULT_SETTINGS, shortcuts: true, center: { ...DEFAULT_SETTINGS.center,
    bindings: [{ command: 'open-help' as const, binding: 'Alt+Shift+H' }] } };
async function fixture() {
    const dom = githubDom(); stops.push(() => dom.dom.window.close()); const h = backgroundCenterFixture(); stops.push(h.stop);
    h.localValues.set(SETTINGS_KEY, settings); vi.mocked(h.api.runtime.sendMessage).mockImplementation(message => h.call(message, pageSender));
    vi.spyOn(dom.document, 'hasFocus').mockReturnValue(true); const registered = vi.spyOn(dom.dom.window, 'addEventListener');
    const mounted = vi.spyOn(shortcutAdapter, 'mountShortcuts');
    const stop = startContent(h.api, dom.window, dom.document)!; stops.push(stop);
    await vi.waitFor(() => expect(mounted.mock.calls.at(-1)?.[1].current()).toBe(true));
    expect(mounted.mock.calls.at(-1)?.[0].settings.bindings).toEqual(settings.center.bindings);
    const keydown = registered.mock.calls.filter(call => call[0] === 'keydown').at(-1)![1] as (event: KeyboardEvent) => void;
    const event = () => ({ isTrusted: true, key: 'h', code: 'KeyH', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false,
        repeat: false, isComposing: false, keyCode: 72, defaultPrevented: false, getModifierState: () => false,
        target: dom.document.body, composedPath: () => [dom.document.body, dom.document, dom.window], preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    // Trust is a deterministic native-orchestration fact here; actual browser key delivery remains separate.
    return { ...dom, ...h, keydown, event, contentStop: stop };
}
it('the real content/background compositions deliver one fixed local destination using source-bound configuration without HTTP or new grants', async () => {
    const h = await fixture(); h.keydown(h.event());
    await vi.waitFor(() => expect(h.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'chrome-extension://test/runtime.html#/help', windowId: 1 }));
    await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-shortcut-status]')?.textContent).toBe(shortcutsCopy('en').opened));
    expect(h.provider).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled();
});
it.each(['profile', 'feature', 'pause'] as const)('a fresh resolved %s disable retires the actual key listener before any queued callback can open another tab', async policy => {
    const h = await fixture();
    h.localValues.set(SETTINGS_KEY, { ...settings, revision: 1, paused: policy === 'pause',
        features: policy === 'feature' ? { 'BEX-CENTER-07': false } : {}, center: { ...settings.center,
            profiles: policy === 'profile' ? [{ id: 'host', name: 'Host', scope: { kind: 'host', host: 'github.com' }, preferences: { shortcuts: false } }] : [],
            selected: policy === 'profile' ? ['host'] : [] } });
    for (const listener of h.onMessage.listeners) listener({ version: 1, method: 'runtime.invalidated' }, { id: 'test' }, () => undefined);
    h.keydown(h.event()); await Promise.resolve(); await Promise.resolve();
    expect(h.api.tabs.create).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it.each(['foreign', 'missing'] as const)('an %s source acknowledgement cannot be reported as a confirmed opening or retried', async source => {
    const h = await fixture(); vi.mocked(h.api.runtime.sendMessage).mockImplementation(async message => {
        const reply = await h.call(message, pageSender);
        return record(message) && message.method === 'settings.open' ? source === 'missing' ? null : { ...reply, sourceTree: 'foreign' } : reply;
    });
    h.keydown(h.event()); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-shortcut-status]')?.textContent).toBe(shortcutsCopy('en').unknown));
    expect(h.api.tabs.create).toHaveBeenCalledOnce();
});
