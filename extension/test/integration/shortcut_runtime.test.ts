import { afterEach, expect, it, vi } from 'vitest';
import { mountShortcuts } from '../../src/adapters/dom/shortcuts.ts';
import { nativeAccessKeyConflict, protectedShortcutTarget } from '../../src/adapters/dom/shortcut_context.ts';
import { BrowserResourceScope } from '../../src/adapters/browser/resource_scope.ts';
import { shortcutsCopy } from '../../src/domain/shortcuts_copy.ts';
import { githubDom } from '../fixtures/dom.ts';
import { context, deferred } from '../fixtures/runtime.ts';
import type { RuntimeContext } from '../../src/application/runtime_ports.ts';
import type { CenterCommand } from '../../src/domain/shortcuts.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(patch: Partial<RuntimeContext> = {}) {
    const dom = githubDom(); stops.push(() => dom.dom.window.close());
    const registered = vi.spyOn(dom.dom.window, 'addEventListener'); vi.spyOn(dom.document, 'hasFocus').mockReturnValue(true);
    const scope = new BrowserResourceScope(() => true); stops.push(() => scope.dispose());
    const open = vi.fn<(_command: CenterCommand) => Promise<boolean>>(async () => true);
    const base = context(); const settings = { ...base.settings, shortcuts: true, features: { 'BEX-CENTER-07': true }, bindings: [{ command: 'open-help' as const, binding: 'Alt+Shift+H' }] };
    const copy = shortcutsCopy('en'); const controller = mountShortcuts({ ...base, settings, ...patch }, scope, dom.window, dom.document, open, copy);
    const listener = (type: string) => registered.mock.calls.find(call => call[0] === type)![1] as (event: KeyboardEvent) => void;
    // Native orchestration fake; genuine event trust/delivery still requires WebDriver evidence.
    const event = (patch: Partial<KeyboardEvent> = {}) => ({ isTrusted: true, key: 'h', code: 'KeyH', altKey: true, shiftKey: true,
        ctrlKey: false, metaKey: false, repeat: false, isComposing: false, keyCode: 72, defaultPrevented: false,
        getModifierState: () => false, target: dom.document.body, composedPath: () => [dom.document.body, dom.document, dom.window], preventDefault: vi.fn(), ...patch }) as KeyboardEvent;
    return { ...dom, scope, open, copy, event, keydown: listener('keydown'), listener, controller };
}
it('a genuine eligible received command opens only its fixed local purpose and announces confirmed native acknowledgement', async () => {
    const h = fixture(); const event = h.event(); h.keydown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(h.open).toHaveBeenCalledExactlyOnceWith('open-help');
    await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-shortcut-status]')?.textContent).toBe(h.copy.opened));
    expect(h.document.querySelector('[data-copilot-shortcut-status]')?.getAttribute('aria-live')).toBe('polite'); h.controller.refresh();
});
it.each(['input', 'textarea', 'select', 'button', 'form', 'iframe', 'object', 'embed'])('protected %s targets are rejected before the character or any field value is read', tag => {
    const h = fixture(); const target = h.document.createElement(tag); h.document.body.append(target);
    const event = h.event({ target, composedPath: () => [target, h.document.body] });
    Object.defineProperty(event, 'key', { get: () => { throw new Error('secret-character-read'); } });
    expect(() => h.keydown(event)).not.toThrow(); expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
});
it.each(['textbox', 'searchbox', 'combobox'])('protected %s roles remain excluded even when their inner event target is inert text', role => {
    const h = fixture(); const editor = h.document.createElement('div'); editor.setAttribute('role', role); const child = h.document.createElement('span'); editor.append(child); h.document.body.append(editor);
    h.keydown(h.event({ target: child, composedPath: () => [child, editor, h.document.body] })); expect(h.open).not.toHaveBeenCalled();
});
it('native editable ancestry, design mode and active input/shadow focus prevent access without reading their contents', () => {
    const h = fixture(); const edit = h.document.createElement('div'); edit.contentEditable = 'true'; edit.setAttribute('contenteditable', 'true'); const child = h.document.createElement('span'); edit.append(child); h.document.body.append(edit);
    expect(protectedShortcutTarget(h.document, h.event({ target: child, composedPath: () => [child, edit] }))).toBe(true);
    edit.setAttribute('contenteditable', 'false'); expect(protectedShortcutTarget(h.document, h.event({ target: child, composedPath: () => [child, edit] }))).toBe(false);
    h.document.designMode = 'on'; expect(protectedShortcutTarget(h.document, h.event())).toBe(true); h.document.designMode = 'off';
    const input = h.document.createElement('input'); input.type = 'password'; h.document.body.append(input); input.focus(); h.keydown(h.event()); expect(h.open).not.toHaveBeenCalled();
    input.blur(); const host = h.document.createElement('private-editor'); host.tabIndex = 0; h.document.body.append(host); host.attachShadow({ mode: 'closed' }); host.focus();
    h.keydown(h.event({ target: host, composedPath: () => [host, h.document.body] })); expect(h.open).not.toHaveBeenCalled();
});
it('a closed editor on an ordinary focused host is excluded before reading its character', () => {
    const h = fixture(); const host = h.document.createElement('div'); const shadow = host.attachShadow({ mode: 'closed' });
    const input = h.document.createElement('input'); input.type = 'password'; shadow.append(input); h.document.body.append(host); input.focus();
    expect(h.document.activeElement).toBe(host); const key = vi.fn(() => 'h'); const event = h.event({ target: host, composedPath: () => [host, h.document.body] });
    Object.defineProperty(event, 'key', { get: key }); h.keydown(event);
    expect(key).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
});
it('ordinary keyboard focus on the known nonediting main region retains the configured navigation command', () => {
    const h = fixture(); const main = h.document.querySelector('main')!; main.tabIndex = -1; main.focus(); expect(h.document.activeElement).toBe(main);
    h.keydown(h.event({ target: main, composedPath: () => [main, h.document.body] })); expect(h.open).toHaveBeenCalledExactlyOnceWith('open-help');
});
it('missing targets, incomplete paths and foreign-document elements are uninspectable contexts rather than safe defaults', () => {
    const h = fixture(); expect(protectedShortcutTarget(h.document, h.event({ target: null }))).toBe(true);
    expect(protectedShortcutTarget(h.document, h.event({ composedPath: () => [] }))).toBe(true);
    const foreign = h.document.implementation.createHTMLDocument().createElement('span');
    expect(protectedShortcutTarget(h.document, h.event({ composedPath: () => [h.document.body, foreign] }))).toBe(true);
    const detached = h.document.implementation.createHTMLDocument(); expect(protectedShortcutTarget(detached, h.event({ target: detached.body }))).toBe(true);
});
it('composition lifecycle is honored even when the delivered keyboard event omits its composing flag', async () => {
    const h = fixture(); h.listener('compositionstart')(h.event()); h.keydown(h.event()); expect(h.open).not.toHaveBeenCalled();
    h.listener('compositionend')(h.event()); h.keydown(h.event()); expect(h.open).toHaveBeenCalledOnce(); await Promise.resolve();
    h.listener('compositionstart')(h.event()); h.listener('blur')(h.event()); h.keydown(h.event()); expect(h.open).toHaveBeenCalledTimes(2);
});
it('synthetic composition and focus events cannot start or release the native composition guard', async () => {
    const h = fixture(); h.listener('compositionstart')(h.event({ isTrusted: false })); h.keydown(h.event()); expect(h.open).toHaveBeenCalledOnce(); await Promise.resolve();
    h.listener('compositionstart')(h.event()); h.listener('compositionend')(h.event({ isTrusted: false })); h.listener('blur')(h.event({ isTrusted: false }));
    h.keydown(h.event()); expect(h.open).toHaveBeenCalledOnce(); h.listener('compositionend')(h.event()); h.keydown(h.event()); expect(h.open).toHaveBeenCalledTimes(2);
});
it.each([{ isTrusted: false }, { defaultPrevented: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 },
    { getModifierState: () => true }, { ctrlKey: true }, { metaKey: true }, { altKey: false }, { shiftKey: false }, { key: 'Dead' }])('native admission fact %j leaves the key untouched', patch => {
    const h = fixture(); const event = h.event(patch); h.keydown(event); expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
});
it.each(['hidden', 'unfocused', 'route', 'scope', 'paused', 'setting', 'feature'] as const)('retired or inactive %s context cannot deliver a command', reason => {
    const base = context(); const h = fixture(reason === 'paused' ? { paused: true } : reason === 'setting' ? { settings: { ...base.settings, shortcuts: false } }
        : reason === 'feature' ? { settings: { ...base.settings, shortcuts: true, features: { 'BEX-CENTER-07': false } } } : {});
    if (reason === 'hidden') vi.spyOn(h.document, 'visibilityState', 'get').mockReturnValue('hidden');
    if (reason === 'unfocused') vi.spyOn(h.document, 'hasFocus').mockReturnValue(false);
    if (reason === 'route') h.dom.reconfigure({ url: 'https://github.com/login' }); if (reason === 'scope') h.scope.dispose();
    const event = h.event(); h.keydown(event); expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
});
it('native page access-key collisions preserve native behavior and show a local explanation', () => {
    const h = fixture(); const button = h.document.createElement('button'); button.setAttribute('accesskey', 'x H'); h.document.body.append(button);
    const event = h.event(); h.keydown(event); expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.document.querySelector('[data-copilot-shortcut-status]')?.textContent).toBe(h.copy.conflict);
});
it('a modified symbol opens its physical command while native access keys for either physical or delivered characters retain priority', async () => {
    const h = fixture(); const button = h.document.createElement('button'); button.setAttribute('accesskey', 'x'); h.document.body.append(button);
    h.keydown(h.event({ key: 'Ó' })); expect(h.open).toHaveBeenCalledOnce(); await Promise.resolve();
    button.setAttribute('accesskey', 'ó'); const event = h.event({ key: 'Ó' }); h.keydown(event);
    expect(h.open).toHaveBeenCalledOnce(); expect(event.preventDefault).not.toHaveBeenCalled(); expect(h.document.body.textContent).toContain(h.copy.conflict);
});
it('native access-key enumeration is bounded, errors remain unknown, and no such result certifies OS conflicts', () => {
    const h = fixture(); for (let index = 0; index < 129; index++) { const node = h.document.createElement('span'); node.setAttribute('accesskey', 'x'); h.document.body.append(node); }
    expect(nativeAccessKeyConflict(h.document, 'h')).toBe('unknown'); const event = h.event(); h.keydown(event);
    expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled(); expect(h.document.body.textContent).toContain(h.copy.unavailable);
    vi.spyOn(h.document, 'querySelectorAll').mockImplementationOnce(() => { throw new Error('private-native'); }); expect(nativeAccessKeyConflict(h.document, 'h')).toBe('unknown');
});
it.each(['unconfirmed', 'throw', 'reject'] as const)('an %s opening preserves uncertainty and never retries or displays provider exceptions', async result => {
    const h = fixture(); if (result === 'throw') h.open.mockImplementationOnce(() => { throw new Error('private-native'); });
    else if (result === 'reject') h.open.mockRejectedValueOnce(new Error('private-native')); else h.open.mockResolvedValueOnce(false);
    h.keydown(h.event()); await vi.waitFor(() => expect(h.document.querySelector('[data-copilot-shortcut-status]')?.textContent).toBe(h.copy.unknown));
    expect(h.open).toHaveBeenCalledOnce(); expect(h.document.body.textContent).not.toContain('private-native');
});
it('one pending native open suppresses fanout and disposal removes observers/status before late acknowledgement', async () => {
    const h = fixture(); const wait = deferred<boolean>(); h.open.mockReturnValueOnce(wait.promise); h.keydown(h.event()); h.keydown(h.event());
    expect(h.open).toHaveBeenCalledOnce(); h.scope.dispose(); h.keydown(h.event()); wait.resolve(true); await Promise.resolve();
    expect(h.document.querySelector('[data-copilot-shortcut-status]')).toBeNull(); expect(h.open).toHaveBeenCalledOnce();
});
it('an invalidated native property cannot escape as an exception or cause the key to be consumed', () => {
    const h = fixture(); const event = h.event({ getModifierState: () => { throw new Error('closed-context'); } });
    expect(() => h.keydown(event)).not.toThrow(); expect(h.open).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
});
it('Mac Option is distinguished from Windows/Linux AltGr without weakening independent Ctrl/Meta or typing guards', async () => {
    const h = fixture(); const platform = vi.spyOn(h.window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
    h.keydown(h.event({ key: 'Ó', getModifierState: () => true })); expect(h.open).toHaveBeenCalledOnce(); await Promise.resolve();
    h.keydown(h.event({ key: 'Ó', ctrlKey: true, getModifierState: () => true })); expect(h.open).toHaveBeenCalledOnce();
    platform.mockReturnValue('Win32'); h.keydown(h.event({ getModifierState: () => true })); expect(h.open).toHaveBeenCalledOnce();
    platform.mockReturnValue('Linux x86_64'); h.keydown(h.event({ getModifierState: () => true })); expect(h.open).toHaveBeenCalledOnce();
});
it('unavailable native platform or target observations leave the event untouched and expose no provider exception', () => {
    const h = fixture(); vi.spyOn(h.window.navigator, 'platform', 'get').mockImplementationOnce(() => { throw new Error('private-platform'); });
    const event = h.event({ getModifierState: () => true }); h.keydown(event); expect(event.preventDefault).not.toHaveBeenCalled();
    const other = h.event({ composedPath: () => { throw new Error('closed-native-target'); } });
    expect(() => h.keydown(other)).not.toThrow(); expect(other.preventDefault).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});
it('a partial eligible page without a main anchor can still open local help without injecting into unrelated content', async () => {
    const h = fixture(); h.document.querySelector('main')!.remove(); h.keydown(h.event()); await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    expect(h.document.querySelector('[data-copilot-shortcut-status]')).toBeNull();
});
