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
