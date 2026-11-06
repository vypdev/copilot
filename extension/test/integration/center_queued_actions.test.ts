// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
vi.mock('svelte', async original => {
    const actual = await original<typeof import('svelte')>();
    // Observe the real presentation port while retaining actual Svelte rendering.
    return { ...actual, mount: vi.fn(actual.mount) };
});
import { mount, tick } from 'svelte';
import type { CenterSurface } from '../../src/presentation/center_surface.ts';
import { CenterClient } from '../../src/application/center_client.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { ready, render, change } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { renderHistory, historyReview } from '../fixtures/history_center_dom.ts';

function surface(): CenterSurface {
    const props = vi.mocked(mount).mock.calls.at(-1)![1].props as { surface: CenterSurface };
    expect(props.surface.initial).toBeDefined(); return props.surface;
}
it.each(['opening', 'future'] as const)('a queued export in the %s state cannot download fabricated preferences', async state => {
    vi.mocked(mount).mockClear(); const native = centerClientFixture();
    if (state === 'opening') native.port.send.mockResolvedValueOnce(null);
    await render('recovery', false, state === 'future' ? { schemaVersion: 99 } : undefined, false, native);
    const createObjectURL = vi.fn(); vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    expect(await surface().actions.exportSettings()).toBe(false); expect(createObjectURL).not.toHaveBeenCalled();
    expect(native.native.port.set).not.toHaveBeenCalled();
});
it('a queued discard during an accepted commit is rejected before forwarding dismissal, then a later explicit discard can navigate', async () => {
    vi.mocked(mount).mockClear(); const h = await render('appearance'); const port = surface();
    await ready(() => !!document.querySelector('#center-density'), 'appearance form loaded');
    change('center-density', 'compact'); window.location.hash = '#/help'; await ready(() => !!document.querySelector('section[role=alert]'), 'pending destination');
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await ready(() => !!document.querySelector('#settings-review-heading'), 'preview is rendered');
    const begun = deferred<void>(); const release = deferred<void>();
    vi.mocked(h.native.port.set).mockImplementationOnce(async (key, value) => { begun.resolve(); await release.promise; h.native.values.set(key, value); });
    const dismiss = vi.spyOn(CenterClient.prototype, 'dismiss');
    port.actions.confirm(); await begun.promise;
    try {
        port.actions.leave(); await tick(); expect(dismiss).not.toHaveBeenCalled();
        expect(window.location.hash).toBe('#/appearance'); expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.cancel')).toBe(false);
    } finally { release.resolve(); }
    await ready(() => document.querySelector('section [role=status]')?.textContent === 'El cambio está guardado.', 'saved outcome');
    port.actions.leave(); await ready(() => window.location.hash === '#/help', 'explicit navigation after save');
    expect(dismiss).toHaveBeenCalledOnce(); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
it('a pending discard callback cannot navigate the disposed document or its replacement', async () => {
    vi.mocked(mount).mockClear(); const h = await render('appearance'); const port = surface();
    await ready(() => !!document.querySelector('#center-density'), 'appearance form loaded');
    change('center-density', 'compact'); window.location.hash = '#/help'; await ready(() => !!document.querySelector('section[role=alert]'));
    port.actions.leave(); h.stop(); const replace = vi.spyOn(window.history, 'replaceState');
    await tick(); expect(replace).not.toHaveBeenCalled(); expect(window.location.hash).toBe('#/appearance');
});
it.each(['disposed', 'blurred', 'hidden', 'navigated'] as const)('queued inspector callbacks in a %s context cannot query native permissions or read a GitHub identity', async context => {
    vi.mocked(mount).mockClear(); const h = await render('privacy'); const port = surface();
    await ready(() => !!document.querySelector('[data-permission-status]'));
    if (context === 'disposed') { h.stop(); await tick(); }
    else if (context === 'blurred') window.dispatchEvent(new Event('blur'));
    else if (context === 'hidden') {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
    } else { window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('#center-theme')); }
    const probes = vi.mocked(h.browser.api.permissions.contains).mock.calls.length;
    const reads = h.port.send.mock.calls.filter(([message]) => message.method === 'center.connections.read').length;
    port.actions.inspectPermissions(); port.actions.inspectConnection(); await tick();
    expect(h.browser.api.permissions.contains).toHaveBeenCalledTimes(probes);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.connections.read')).toHaveLength(reads);
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it.each(['invalid', 'unchanged'] as const)('a primary %s response keeps independent history consent available, while a retained history review fences queued preference edits', async issue => {
    vi.mocked(mount).mockClear(); const f = await renderHistory('diagnostics'); const p = surface();
    p.actions.preview(issue === 'invalid' ? { type: 'unsupported' } : { type: 'preferences', values: {} }, 0);
    await ready(() => document.querySelector('main > [role=alert]') !== null);
    p.actions.history.preview('diagnostics', 'start'); await historyReview(); const before = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.preview').length;
    p.actions.preview({ type: 'preferences', values: { density: 'compact' } }, 0); await tick(); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.preview')).toHaveLength(before);
    p.actions.history.cancel(); await ready(() => document.querySelector('.history-review')?.textContent?.includes(f.copy.phases.cancelled) === true);
    expect(f.port.set).not.toHaveBeenCalled(); p.actions.history.dismiss(); await ready(() => !document.querySelector('.history-review'));
});
it('a queued history read or effect after blur cannot use retired observations or submit a new native preview', async () => {
    vi.mocked(mount).mockClear(); const f = await renderHistory('diagnostics'); const p = surface(); window.dispatchEvent(new Event('blur'));
    const count = f.app.port.send.mock.calls.length; p.actions.history.read('diagnostics'); p.actions.history.preview('diagnostics', 'start'); await tick();
    expect(f.app.port.send).toHaveBeenCalledTimes(count); expect(f.port.set).not.toHaveBeenCalled();
});
it('a pending cancellation response keeps the old route until read-only inspection retires the retained review', async () => {
    vi.mocked(mount).mockClear(); const f = await renderHistory('diagnostics'); const p = surface(); p.actions.history.clear('diagnostics'); await historyReview();
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('section[role=alert]'), 'history discard destination is guarded');
    const send = f.app.port.send.getMockImplementation()!; f.app.port.send.mockImplementation(async message => {
        const result = await send(message); return message.method === 'center.history.clear.cancel' ? { state: 'pending', sourceTree: f.app.port.sourceTree } : result;
    });
    p.actions.leave(); await ready(() => document.querySelector('.history-review')?.getAttribute('aria-busy') === 'true', 'native pending cancellation remains busy');
    expect(window.location.hash).toBe('#/diagnostics'); p.actions.history.inspect(); await ready(() => document.querySelector('.history-review')?.textContent?.includes(f.copy.issues.expired) === true, 'read-only inspection reports retired native review');
    p.actions.leave(); await ready(() => !!document.querySelector('#center-theme'), 'explicit leave after native review retirement'); expect(f.port.set).not.toHaveBeenCalled();
});
