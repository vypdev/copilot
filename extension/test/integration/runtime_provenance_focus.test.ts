import { afterEach, expect, it, vi } from 'vitest';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { githubDom } from '../fixtures/dom.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { configurationReply } from '../fixtures/page_configuration.ts';
import { deferred } from '../fixtures/runtime.ts';
import { record } from '../../src/domain/value.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() {
    const dom = githubDom(); const h = browserFixture(); const pending = deferred<unknown>(); let deliveries = 0; let held: unknown;
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async message => {
        if (record(message) && message.method === 'page.configuration') { if (++deliveries === 2) { held = message; return pending.promise; } return configurationReply(message); }
        return { state: 'released' };
    });
    const stop = startContent(h.api, dom.window, dom.document)!; stops.push(() => { stop(); dom.dom.window.close(); });
    const panel = () => dom.document.querySelector<HTMLElement>('[data-copilot-runtime]')!;
    const check = () => panel().querySelector<HTMLButtonElement>('[data-copilot-inspect-configuration]')!;
    await vi.waitFor(() => expect(panel()?.dataset.copilotSettings).toBe('ready'));
    return { ...dom, ...h, panel, check, deliver: () => { pending.resolve(configurationReply(held)); }, ready: () => vi.waitFor(() => expect(panel()?.dataset.copilotSettings).toBe('ready')) };
}
it('a metadata recheck preserves owned focus and all expanded details across the pending shell without issuing an activity read', async () => {
    const h = await fixture(); const explanation = h.panel().querySelector<HTMLDetailsElement>('[data-copilot-provenance]')!;
    const features = h.panel().querySelector<HTMLDetailsElement>('[data-copilot-preference-sources]')!; const technical = h.panel().querySelector<HTMLDetailsElement>('details:last-child')!;
    explanation.open = true; features.open = true; technical.open = true; features.dispatchEvent(new h.dom.window.Event('toggle'));
    expect(features.querySelectorAll('[data-copilot-preference]')).toHaveLength(150); h.check().focus(); h.check().click();
    expect(h.panel().dataset.copilotSettings).toBe('unavailable'); expect(h.document.activeElement).toBe(h.panel().querySelector('h2')); expect(h.check().disabled).toBe(true);
    h.check().click(); h.deliver(); await h.ready(); expect(h.document.activeElement).toBe(h.check());
    expect(h.panel().querySelector<HTMLDetailsElement>('[data-copilot-provenance]')!.open).toBe(true);
    const current = h.panel().querySelector<HTMLDetailsElement>('[data-copilot-preference-sources]')!; expect(current.open).toBe(true);
    current.dispatchEvent(new h.dom.window.Event('toggle')); current.dispatchEvent(new h.dom.window.Event('toggle')); expect(current.querySelectorAll('[data-copilot-preference]')).toHaveLength(150);
    expect(h.panel().querySelector<HTMLDetailsElement>('details:last-child')!.open).toBe(true);
    expect(vi.mocked(h.api.runtime.sendMessage).mock.calls.filter(([v]) => record(v) && v.method === 'page.configuration')).toHaveLength(2);
    expect(h.api.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'page.configuration', inspectOnly: true }));
    expect(h.api.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'page.snapshot' }));
});
it('typing in a native GitHub draft during pending metadata is never interrupted by the ready delivery', async () => {
    const h = await fixture(); h.check().focus(); h.check().click(); const editor = h.document.querySelector('textarea')!;
    editor.focus(); editor.value += '\nStill typing'; editor.setSelectionRange(2, 8); const draft = editor.value;
    h.deliver(); await h.ready(); expect(h.document.activeElement).toBe(editor); expect(editor.value).toBe(draft); expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 8]);
});
it('a different native account retires pending owned view restoration and never reopens the former scope details', async () => {
    const h = await fixture(); const explanation = h.panel().querySelector<HTMLDetailsElement>('[data-copilot-provenance]')!; explanation.open = true;
    h.check().focus(); h.check().click(); const editor = h.document.querySelector('textarea')!; editor.focus();
    h.document.querySelector<HTMLMetaElement>('meta[name="user-login"]')!.content = 'other'; await h.ready();
    expect(h.panel().querySelector<HTMLDetailsElement>('[data-copilot-provenance]')!.open).toBe(false); expect(h.document.activeElement).toBe(editor);
    h.deliver(); await Promise.resolve(); expect(h.panel().querySelector<HTMLDetailsElement>('[data-copilot-provenance]')!.open).toBe(false);
});
it('opening and closing the lazy feature list performs no IPC and retired listeners cannot populate detached old content', async () => {
    const h = await fixture(); const features = h.panel().querySelector<HTMLDetailsElement>('[data-copilot-preference-sources]')!;
    expect(features.querySelectorAll('li')).toHaveLength(0); const calls = vi.mocked(h.api.runtime.sendMessage).mock.calls.length;
    features.open = true; features.dispatchEvent(new h.dom.window.Event('toggle')); features.open = false; features.open = true; features.dispatchEvent(new h.dom.window.Event('toggle'));
    expect(features.querySelectorAll('li')).toHaveLength(150); expect(h.api.runtime.sendMessage).toHaveBeenCalledTimes(calls);
    features.open = false; h.check().click(); features.querySelector('ul')!.replaceChildren(); features.dispatchEvent(new h.dom.window.Event('toggle')); expect(features.querySelectorAll('li')).toHaveLength(0);
    h.deliver(); await h.ready(); expect(h.panel().querySelectorAll('[data-copilot-preference]')).toHaveLength(0);
});
