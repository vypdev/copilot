// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { flushSync, tick } from 'svelte';
import { ready, render, button } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

it('discarding an import draft retires a slow native file read before it can create a preview on another route', async () => {
    const h = await render('data'); await ready(() => !!document.querySelector('#center-import'));
    const bytes = new TextEncoder().encode(JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'dark' }));
    const pending = deferred<ArrayBuffer>(); const begun = deferred<void>(); let reads = 0;
    const input = document.querySelector<HTMLInputElement>('#center-import')!;
    Object.defineProperty(input, 'files', { value: [{ size: bytes.byteLength, arrayBuffer: () => { reads++; begun.resolve(); return pending.promise; } }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync(); input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await begun.promise; flushSync(); expect(input.closest('form')?.getAttribute('aria-busy')).toBe('true');
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true })); expect(reads).toBe(1);
    window.location.hash = '#/appearance'; await ready(() => document.body.textContent?.includes('Tienes un borrador sin guardar.') === true);
    button('Descartar borrador y salir').click(); await ready(() => !!document.querySelector('#center-theme'));
    pending.resolve(bytes.buffer); await tick(); await new Promise<void>(resolve => setTimeout(resolve, 0)); flushSync();
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview')).toHaveLength(0);
    expect(document.querySelector('#settings-review-heading')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
});
