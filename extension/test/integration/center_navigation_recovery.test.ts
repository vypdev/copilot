// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { tick } from 'svelte';
import { button, ready, render } from '../fixtures/center_app_dom.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

it('the actual mounted Recovery sanitizes a later rejected fragment without replacing preferences, exposing it or stealing focus', async () => {
    const h = await render('recovery'); const copy = centerCopy('es'); await tick();
    const refresh = button(copy.messages.refresh); refresh.focus();
    const before = structuredClone([...h.native.values]); const sent = h.port.send.mock.calls.length;
    window.location.hash = '#/unknown-private-marker';
    await ready(() => window.location.hash === '#/recovery');
    expect(document.querySelector('main > h1')?.textContent).toBe(copy.routes.recovery);
    expect(document.activeElement).toBe(refresh); expect([...h.native.values]).toEqual(before);
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain('private-marker');
    expect(h.port.send).toHaveBeenCalledTimes(sent);
    expect(JSON.stringify(h.port.send.mock.calls)).not.toContain('private-marker');
});
