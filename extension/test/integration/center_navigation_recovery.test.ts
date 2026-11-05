// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { tick } from 'svelte';
import { button, ready, render } from '../fixtures/center_app_dom.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

it('the actual mounted Recovery sanitizes a later rejected fragment without replacing preferences, exposing it or stealing focus', async () => {
    const fixture = centerClientFixture();
    const send = fixture.port.send.getMockImplementation()!;
    fixture.port.send.mockImplementation(async message => message.method === 'center.recents.capture'
        ? { state: 'ready', permit: null, epoch: null, sequence: 0, sourceTree: fixture.port.sourceTree }
        : send(message));
    const h = await render('recovery', false, undefined, true, fixture); const copy = centerCopy('es');
    // Startup checks collection consent independently of the initial Recovery render.
    await ready(() => h.port.send.mock.calls.some(([message]) => message.method === 'center.recents.capture'));
    await tick();
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
