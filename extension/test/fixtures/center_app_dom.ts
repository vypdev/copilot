import { afterEach, expect, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { browserFixture } from './browser.ts';
import { centerClientFixture } from './center_client.ts';
import { CENTER_BINDING } from './center.ts';
import { semanticCenterChannel } from './semantic_center_channel.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';

const stops: (() => void)[] = [];
const currentCopy = () => centerCopy('auto', document.documentElement.lang);
const routeContentReady = () => ![...document.querySelectorAll('main > p[role=status]')].some(node => node.textContent === currentCopy().messages.loading);
afterEach(async () => { for (const stop of stops.splice(0)) stop(); await tick(); document.body.replaceChildren();
    window.history.replaceState(null, '', 'https://extension.test/runtime.html'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
export async function ready(predicate: () => boolean, message?: string): Promise<void> { await vi.waitFor(() => { flushSync(); expect(predicate(), message).toBe(true); }, { timeout: 5000 }); }
export async function render(route = 'overview', observer = false, initial?: unknown, hasSettings = true, native = centerClientFixture(), language = 'es-ES', configure: (browser: ReturnType<typeof browserFixture>) => void = () => undefined) {
    window.history.replaceState(null, '', `https://extension.test/runtime.html#/${route}`);
    const browser = browserFixture();
    if (initial !== undefined) native.native.values.set(SETTINGS_KEY, structuredClone(initial));
    // jsdom requires a nonopaque origin; the actual native gateway keeps its extension sender fixture.
    browser.api.runtime.getURL = path => `https://extension.test/${path}`;
    if (observer) native.native.open({ ...CENTER_BINDING, documentId: 'other-window', tabId: 2 });
    vi.stubGlobal('__COPILOT_SOURCE_TREE__', native.port.sourceTree);
    browser.api.runtime.sendMessage = vi.fn(message => native.port.send(message as Parameters<typeof native.port.send>[0]));
    semanticCenterChannel(browser.api, message => browser.api.runtime.sendMessage(message), native.port.sourceTree);
    configure(browser);
    const stop = startCenter(browser.api, document, language); stops.push(stop);
    await ready(() => document.querySelector('h1') !== null && document.querySelector('main')?.getAttribute('aria-busy') === 'false' && (!hasSettings || !!document.querySelector('main .revision')) && routeContentReady());
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
    window.location.hash = `#/${route}`; await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === `#/${route.split('/')[0]}` && routeContentReady());
}
export async function save(): Promise<void> {
    await ready(() => !!document.querySelector('#settings-review-heading'));
    const revision = Number(document.querySelector('#settings-review-heading')?.closest('section')?.querySelector('details code')?.textContent);
    expect(Number.isSafeInteger(revision) && revision >= 0).toBe(true);
    button(reviewCopy(currentCopy().locale).confirm).click();
    // A saved receipt precedes the independent canonical reread and route remount.
    await ready(() => document.querySelector('#settings-review-status')?.textContent === reviewCopy(currentCopy().locale).states.saved
        && document.querySelector('main .revision code')?.textContent === String(revision + 1)
        && document.querySelector('main')?.getAttribute('aria-busy') === 'false' && routeContentReady());
    button(reviewCopy(currentCopy().locale).dismiss).click();
    await ready(() => !document.querySelector('#settings-review-heading') && document.querySelector('main')?.getAttribute('aria-busy') === 'false' && routeContentReady());
}
