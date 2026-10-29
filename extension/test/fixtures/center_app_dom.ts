import { afterEach, expect, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { browserFixture } from './browser.ts';
import { centerClientFixture } from './center_client.ts';
import { CENTER_BINDING } from './center.ts';

const stops: (() => void)[] = [];
afterEach(async () => { for (const stop of stops.splice(0)) stop(); await tick(); document.body.replaceChildren();
    window.history.replaceState(null, '', 'https://extension.test/runtime.html'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
export async function ready(predicate: () => boolean): Promise<void> { await vi.waitFor(() => { flushSync(); expect(predicate()).toBe(true); }, { timeout: 5000 }); }
export async function render(route = 'overview', observer = false, initial?: unknown, hasSettings = true, native = centerClientFixture(), language = 'es-ES') {
    window.history.replaceState(null, '', `https://extension.test/runtime.html#/${route}`);
    const browser = browserFixture();
    if (initial !== undefined) native.native.values.set(SETTINGS_KEY, structuredClone(initial));
    // jsdom requires a nonopaque origin; the actual native gateway keeps its extension sender fixture.
    browser.api.runtime.getURL = path => `https://extension.test/${path}`;
    if (observer) native.native.open({ ...CENTER_BINDING, documentId: 'other-window', tabId: 2 });
    vi.stubGlobal('__COPILOT_SOURCE_TREE__', native.port.sourceTree);
    browser.api.runtime.sendMessage = vi.fn(message => native.port.send(message as Parameters<typeof native.port.send>[0]));
    const stop = startCenter(browser.api, document, language); stops.push(stop);
    await ready(() => document.querySelector('h1') !== null && document.querySelector('main')?.getAttribute('aria-busy') === 'false' && (!hasSettings || !!document.querySelector('main .revision')));
    return { ...native, browser, stop };
}
export function button(label: string): HTMLButtonElement {
    const value = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === label);
    if (!value) throw new Error(`missing button: ${label}`); return value;
}
export function change(id: string, value: string): void {
    const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    input.value = value; input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); flushSync();
}
export async function navigate(route: string): Promise<void> {
    window.location.hash = `#/${route}`; await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === `#/${route.split('/')[0]}`);
}
export async function save(): Promise<void> {
    await ready(() => !!document.querySelector('#settings-review-heading'));
    button('Confirmar cambio').click(); await ready(() => document.querySelector('section [role=status]')?.textContent === 'El cambio está guardado.');
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading'));
}
