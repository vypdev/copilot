// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { ready, render, button, change } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { deferred } from '../fixtures/runtime.ts';

const copy = reviewCopy('es');
const review = () => document.querySelector<HTMLElement>('section[aria-labelledby=settings-review-heading]');
async function importFile(value: unknown): Promise<void> {
    await ready(() => !!document.querySelector('#center-import'));
    const input = document.querySelector<HTMLInputElement>('#center-import')!;
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    // Only the file-reader boundary is a fixture; the actual foreground, review and gateway run below.
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await ready(() => !!review() && review()?.querySelector('[role=status]')?.textContent === copy.states.preview);
}

it('bexh3-center-C41 an actual file import previews without writing and persists the reviewed complete envelope only after confirmation', async () => {
    const before = { ...DEFAULT_SETTINGS, density: 'compact' as const };
    const h = await render('data', false, { current: before }); const original = JSON.stringify(h.native.values.get(SETTINGS_KEY));
    const imported = { ...DEFAULT_SETTINGS, theme: 'dark' as const };
    await importFile(imported);
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(JSON.stringify(h.native.values.get(SETTINGS_KEY))).toBe(original);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview')).toEqual([
        [expect.objectContaining({ method: 'center.preview', expectedRevision: 0, intent: { type: 'import', settings: imported } })],
    ]);
    expect(review()?.querySelectorAll('dt')).toHaveLength(2);
    button(copy.confirm).click(); await ready(() => review()?.querySelector('[role=status]')?.textContent === copy.states.saved);
    const after = { ...imported, revision: 1 };
    expect(await h.native.repository.read()).toMatchObject({ state: 'ready', settings: after });
    expect(h.native.values.get(SETTINGS_KEY)).toEqual({ current: after, previous: before,
        operation: { id: expect.stringMatching(/^[a-f0-9]{32}$/u), beforeRevision: 0 } });
    expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
    button(copy.dismiss).click(); await ready(() => !review());
    expect(await h.native.repository.read()).toMatchObject({ settings: after }); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});

it('bexh3-center-C41 a file import rechecks a newer durable revision and preserves its values instead of applying a stale review', async () => {
    const h = await render('data', false, { current: DEFAULT_SETTINGS }); await importFile({ ...DEFAULT_SETTINGS, theme: 'dark' });
    await h.native.repository.update(value => ({ ...value, locale: 'fr' }));
    const newer = JSON.stringify(h.native.values.get(SETTINGS_KEY));
    button(copy.confirm).click(); await ready(() => review()?.querySelector('[role=status]')?.textContent === copy.states.conflict);
    expect(JSON.stringify(h.native.values.get(SETTINGS_KEY))).toBe(newer);
    expect(await h.native.repository.read()).toMatchObject({ settings: { revision: 1, locale: 'fr', theme: 'github' } });
    expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect([...review()!.querySelectorAll('button')].map(node => node.textContent)).toEqual([copy.reload, copy.dismiss]);
});

it('an import uses the current observed revision after refresh without replacing the mounted file input', async () => {
    const h = await render('data'); await ready(() => !!document.querySelector('#center-import'));
    const input = document.querySelector('#center-import'); await h.native.repository.update(value => ({ ...value, density: 'compact' }));
    button('Consultar configuración actual').click(); await ready(() => document.querySelector('main .revision code')?.textContent === '1');
    expect(document.querySelector('#center-import')).toBe(input); await importFile({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview').at(-1)?.[0]).toMatchObject({ expectedRevision: 1 });
    expect(h.native.port.set).toHaveBeenCalledOnce(); button(copy.confirm).click(); await ready(() => review()?.querySelector('[role=status]')?.textContent === copy.states.saved);
    expect(await h.native.repository.read()).toMatchObject({ settings: { revision: 2, theme: 'dark' } }); expect(h.native.port.set).toHaveBeenCalledTimes(2);
});
it('an import keeps its submit-time revision when a settings refresh completes during the file read', async () => {
    const h = await render('data'); await ready(() => !!document.querySelector('#center-import'));
    const input = document.querySelector<HTMLInputElement>('#center-import')!; const entered = deferred<void>(); const gate = deferred<void>();
    const bytes = new TextEncoder().encode(JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'dark' }));
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: bytes.byteLength, arrayBuffer: async () => { entered.resolve(); await gate.promise; return bytes.buffer; } }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync(); input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await entered.promise;
    await h.native.repository.update(value => ({ ...value, density: 'compact' })); button('Consultar configuración actual').click();
    await ready(() => document.querySelector('main .revision code')?.textContent === '1'); gate.resolve();
    await ready(() => h.port.send.mock.calls.some(([message]) => message.method === 'center.preview'));
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview').at(-1)?.[0]).toMatchObject({ expectedRevision: 0 });
    await ready(() => !!document.querySelector('#center-runtime-issue'));
    expect(await h.native.repository.read()).toMatchObject({ settings: { revision: 1, density: 'compact', theme: 'github' } }); expect(h.native.port.set).toHaveBeenCalledOnce();
});

it('bexh3-center-C42 reset quota failure retains the complete prior envelope and offers factual readback without an automatic save retry', async () => {
    const current = { ...DEFAULT_SETTINGS, revision: 4, theme: 'dark', density: 'compact',
        center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: 'Work', scope: { kind: 'global' }, preferences: {} }], selected: ['work'] } };
    const envelope = { current, previous: { ...DEFAULT_SETTINGS, revision: 3 }, operation: { id: 'f'.repeat(32), beforeRevision: 3 } };
    const h = await render('data', false, envelope); await ready(() => !!document.querySelector('#center-reset'));
    const original = JSON.stringify(h.native.values.get(SETTINGS_KEY)); change('center-reset', 'appearance'); button('Revisar cambio').click();
    await ready(() => review()?.querySelector('[role=status]')?.textContent === copy.states.preview);
    expect(h.native.port.set).not.toHaveBeenCalled(); vi.mocked(h.native.port.set).mockRejectedValueOnce(new Error('QuotaExceededError synthetic-private-quota'));
    button(copy.confirm).click(); await ready(() => review()?.querySelector('[role=status]')?.textContent === copy.states.unknown);
    expect(JSON.stringify(h.native.values.get(SETTINGS_KEY))).toBe(original); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('synthetic-private-quota');
    const actions = [...review()!.querySelectorAll('button')]; expect(actions.map(node => node.textContent)).toEqual([copy.reload, copy.dismiss]);
    actions[0].click(); await ready(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
    expect(await h.native.repository.read()).toMatchObject({ state: 'ready', settings: current });
    expect(JSON.stringify(h.native.values.get(SETTINGS_KEY))).toBe(original); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
});
