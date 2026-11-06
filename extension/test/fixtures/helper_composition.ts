import { afterEach, expect, vi } from 'vitest';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { HELPER_TREE } from './helper_samples.ts';
import { githubDom } from './dom.ts';
import { backgroundCenterFixture } from './background_center.ts';
import { pageSender } from './page_configuration.ts';
import * as shortcutAdapter from '../../src/adapters/dom/shortcuts.ts';
import * as panelAdapter from '../../src/adapters/dom/runtime_panel.ts';

const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).reverse().forEach(stop => stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
/** Actual content and background compositions, deterministic native delivery; real key/browser evidence remains separate. */
export async function helperCompositionFixture(fault = false, retaining = false) {
    vi.stubGlobal('__COPILOT_SOURCE_TREE__', HELPER_TREE); const dom = githubDom(); stops.push(() => dom.dom.window.close());
    const f = backgroundCenterFixture(browser => browser.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, shortcuts: true, center: { ...DEFAULT_SETTINGS.center, diagnostics: retaining, bindings: [{ command: 'open-help', binding: 'Alt+Shift+H' }] } })); stops.push(f.stop);
    vi.mocked(f.api.tabs.create).mockResolvedValue({ id: 2 }); vi.mocked(f.api.runtime.sendMessage).mockImplementation(message => f.call(message, pageSender));
    vi.spyOn(dom.document, 'hasFocus').mockReturnValue(true); const listeners = vi.spyOn(dom.dom.window, 'addEventListener');
    const panel = vi.spyOn(panelAdapter, 'mountRuntimePanel'); const shortcuts = vi.spyOn(shortcutAdapter, 'mountShortcuts');
    if (fault) panel.mockImplementationOnce(() => { throw new Error('private_helper_fault_marker'); });
    const stop = startContent(f.api, dom.window, dom.document)!; stops.push(stop);
    await vi.waitFor(() => expect(shortcuts.mock.calls.at(-1)?.[1].current()).toBe(true));
    const keydown = listeners.mock.calls.filter(([name]) => name === 'keydown').at(-1)![1] as (event: KeyboardEvent) => void;
    const key = () => keydown({ isTrusted: true, key: 'h', code: 'KeyH', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false,
        repeat: false, isComposing: false, keyCode: 72, defaultPrevented: false, getModifierState: () => false,
        target: dom.document.body, composedPath: () => [dom.document.body, dom.document, dom.window], preventDefault: vi.fn() } as unknown as KeyboardEvent);
    const sender = { id: 'test', frameId: 0, documentId: 'native-options', url: 'chrome-extension://test/runtime.html#/help', tab: { id: 2, incognito: false } };
    const read = async () => {
        const opened = await f.call({ version: 1, method: 'center.open' }, sender);
        return f.call({ version: 1, method: 'center.health.read', clientId: opened.clientId }, sender);
    };
    return { ...f, ...dom, panel, shortcuts, key, read, optionSender: sender, contentStop: stop };
}
