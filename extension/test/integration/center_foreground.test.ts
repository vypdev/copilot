// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { ready, render } from '../fixtures/center_app_dom.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

it('keeps hidden views idle and refreshes the current snapshot when visible again', async () => {
    const h = await render(); const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const before = h.port.send.mock.calls.length; const changed = [...h.browser.changed.listeners][0];
    changed({ [SETTINGS_KEY]: {} }, 'local'); document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(h.port.send).toHaveBeenCalledTimes(before); visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    await ready(() => h.port.send.mock.calls.length > before);
});
it('unrelated settings/session storage notifications do not renew the foreground editing lease', async () => {
    const h = await render(); const before = h.port.send.mock.calls.length; const changed = [...h.browser.changed.listeners][0];
    changed({ [SETTINGS_KEY]: {} }, 'session'); changed({ unrelated: {} }, 'local'); await tick();
    expect(h.port.send).toHaveBeenCalledTimes(before);
});
it('a queued route focus cannot steal focus from a replacement view after disposal', async () => {
    const h = await render(); window.history.replaceState(null, '', '#/appearance'); window.dispatchEvent(new HashChangeEvent('hashchange'));
    h.stop(); const replacement = document.createElement('main'); const heading = document.createElement('h1'); heading.tabIndex = -1;
    replacement.append(heading); document.body.append(replacement); heading.focus(); await tick();
    expect(document.activeElement).toBe(heading);
});
