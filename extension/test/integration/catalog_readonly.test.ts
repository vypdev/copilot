// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { ready, render, button, change, navigate } from '../fixtures/center_app_dom.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { inventoryCopy } from '../../src/domain/inventory_copy.ts';
import { scopedCenterFixture } from '../fixtures/scoped_center.ts';

const items = () => [...document.querySelectorAll<HTMLElement>('[data-inventory-feature]')];
const personalFilters = () => ['inventory-source', 'inventory-profile', 'inventory-setting'].map(id => document.getElementById(id) as HTMLSelectElement);
function inert(): void {
    expect(document.querySelector('form')).toBe(null); expect(document.querySelector('[data-feature-favorite]')).toBe(null);
    expect(document.querySelector('[data-feature-source]')).toBe(null);
}
it.each([{ schemaVersion: 99 }, { schemaVersion: 2, broken: true }])('bexh3-center-C25 preserves complete discovery when saved data is incompatible: %j', async initial => {
    const h = await render('features', false, initial, false); await ready(() => !!document.querySelector('#inventory-search'));
    expect(document.querySelector('#inventory-results')!.textContent).toContain('150 resultados'); expect(items()).toHaveLength(25);
    expect(items()[0].textContent).toContain('Preferencia guardada desconocida'); inert();
    expect(personalFilters().every(select => select.disabled)).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);
    change('inventory-family', 'NAV'); change('inventory-surface', 'issue'); await ready(() => items().length < 12);
    expect(items().some(item => item.dataset.inventoryFeature === 'BEX-NAV-02')).toBe(true);
    button('Limpiar búsqueda y filtros').click(); await ready(() => items().length === 25);
    button('Resultados siguientes').click(); await ready(() => items()[0]?.dataset.inventoryFeature === 'BEX-CODE-14');
    change('inventory-search', 'BEX-SETUP-18'); await ready(() => items().length === 1);
    await navigate('features/BEX-SETUP-18'); await ready(() => !!document.querySelector('[data-inventory-unknown]')); inert();
    expect(document.querySelector('[data-feature-detail] a[href="https://github.com/vypdev/copilot/issues/712"]')).not.toBe(null);
    expect(h.native.values.get(SETTINGS_KEY)).toEqual(initial); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(h.port.send.mock.calls.some(([m]) => m.method === 'center.connections.read' || m.method === 'center.preview')).toBe(false);
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('keeps static detail usable after an unavailable native opening response without claiming editable defaults', async () => {
    const native = centerClientFixture(); native.port.send.mockResolvedValueOnce(null);
    const h = await render('features/BEX-NAV-01', false, undefined, false, native);
    await ready(() => !!document.querySelector('[data-inventory-unknown]')); inert();
    expect(document.querySelector('.revision')).toBe(null);
    expect(document.querySelector('a[href="https://github.com/vypdev/copilot/issues/705"]')).not.toBe(null);
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('does not require readable local storage or a connection to search the static catalog', async () => {
    const native = centerClientFixture(); vi.mocked(native.native.port.get).mockRejectedValue(new Error('private-storage-error'));
    const h = await render('features', false, undefined, false, native); await ready(() => !!document.querySelector('#inventory-search'));
    change('inventory-search', 'BEX-NAV-01'); await ready(() => items().length === 1); inert();
    expect(document.body.textContent).not.toContain('private-storage-error'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('does not retry failed migration while navigating static discovery', async () => {
    const native = centerClientFixture(); const { center: _center, ...legacy } = DEFAULT_SETTINGS;
    vi.mocked(native.native.port.set).mockRejectedValue(new Error('quota'));
    const h = await render('features', false, { ...legacy, schemaVersion: 1 }, false, native);
    await ready(() => !!document.querySelector('#inventory-search')); const attempts = vi.mocked(h.native.port.set).mock.calls.length;
    await navigate('features/BEX-CENTER-02'); await ready(() => !!document.querySelector('[data-inventory-unknown]')); inert();
    expect(h.native.port.set).toHaveBeenCalledTimes(attempts); expect(document.body.textContent).toContain('necesita migrarse');
});
it.each(['en', 'es', 'fr', 'pt'] as const)('explains unknown preferences using native %s when a future schema cannot supply a trusted locale', async locale => {
    await render('features/BEX-CENTER-02', false, { schemaVersion: 99, locale: 'untrusted-locale' }, false, centerClientFixture(), locale);
    await ready(() => !!document.querySelector('[data-inventory-unknown]'));
    expect(document.querySelector('.center')!.getAttribute('lang')).toBe(locale);
    expect(document.querySelector('[data-inventory-unknown]')!.textContent).toBe(inventoryCopy(locale).unknownHint);
    expect(document.body.textContent).not.toContain('untrusted-locale'); inert();
});
it('restores editable saved preferences only after an explicit successful current read', async () => {
    const h = await render('features/BEX-NAV-01', false, { schemaVersion: 99 }, false);
    await ready(() => !!document.querySelector('[data-inventory-unknown]')); h.native.values.set(SETTINGS_KEY, DEFAULT_SETTINGS);
    button('Consultar configuración actual').click(); await ready(() => !!document.querySelector('#feature-global-preference'));
    expect(document.querySelector('[data-inventory-unknown]')).toBe(null); expect(document.querySelector('[data-feature-source]')!.textContent).toContain('predeterminado');
    expect(document.querySelector<HTMLFieldSetElement>('form fieldset')!.disabled).toBe(false); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('retires stored favorites, profile names and personal filters when a new current read exposes a future schema', async () => {
    const initial = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, favorites: ['BEX-NAV-01'],
        profiles: [{ id: 'private', name: 'Private saved profile', scope: { kind: 'global' }, preferences: {} }] } };
    const h = await render('features', false, initial); await ready(() => !!document.querySelector('#inventory-search'));
    change('inventory-profile', 'private'); await ready(() => items().length === 0);
    h.native.values.set(SETTINGS_KEY, { schemaVersion: 99 }); button('Consultar configuración actual').click();
    await ready(() => personalFilters().every(select => select.disabled)); expect(items()).toHaveLength(25);
    expect(document.body.textContent).not.toContain('Private saved profile'); expect(personalFilters().every(select => select.value === '')).toBe(true); inert();
    change('inventory-search', 'BEX-NAV-01'); await ready(() => items().length === 1);
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('keeps an authored override inert during unknown settings and preserves its original revision fence after recovery', async () => {
    const h = await render('features/BEX-NAV-01'); await ready(() => !!document.querySelector('#feature-global-preference'));
    change('feature-global-preference', 'disabled'); h.native.values.set(SETTINGS_KEY, { schemaVersion: 99 });
    button('Consultar configuración actual').click(); await ready(() => !!document.querySelector('[data-inventory-unknown]'));
    const form = document.querySelector('form')!;
    expect(document.querySelector<HTMLFieldSetElement>('form fieldset')!.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#feature-global-preference')!.value).toBe('disabled');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(h.port.send.mock.calls.some(([m]) => m.method === 'center.preview')).toBe(false);
    h.native.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 1, features: { 'BEX-NAV-01': true } });
    button('Consultar configuración actual').click(); await ready(() => document.querySelector<HTMLFieldSetElement>('form fieldset')?.disabled === false);
    expect(document.querySelector<HTMLSelectElement>('#feature-global-preference')!.value).toBe('disabled');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await ready(() => h.port.send.mock.calls.some(([m]) => m.method === 'center.preview'));
    const preview = h.port.send.mock.calls.find(([m]) => m.method === 'center.preview')![0];
    expect(preview).toMatchObject({ expectedRevision: 0 }); expect(document.querySelector('#settings-review-heading')).toBe(null);
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('updates an untouched preference form from a successful external revision before authoring a new intent', async () => {
    const h = await render('features/BEX-NAV-01'); await ready(() => !!document.querySelector('#feature-global-preference'));
    h.native.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 1, features: { 'BEX-NAV-01': false } });
    button('Consultar configuración actual').click(); await ready(() => document.querySelector<HTMLSelectElement>('#feature-global-preference')?.value === 'disabled');
    change('feature-global-preference', 'enabled'); document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await ready(() => !!document.querySelector('#settings-review-heading'));
    const preview = h.port.send.mock.calls.find(([m]) => m.method === 'center.preview')![0];
    expect(preview).toMatchObject({ expectedRevision: 1 }); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('rereads current connection context only after an explicit compatible recovery and restores verified scope provenance', async () => {
    const scoped = await scopedCenterFixture(); const h = await render('features/BEX-NAV-01', false, { schemaVersion: 99 }, false, scoped.application);
    await ready(() => !!document.querySelector('[data-inventory-unknown]'));
    expect(document.body.textContent).not.toContain('company/example');
    expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.connections.read')).toBe(false);
    const profile = { id: 'work', name: 'Work', scope: { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' }, preferences: { features: { 'BEX-NAV-01': false } } };
    h.native.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['work'] } });
    button('Consultar configuración actual').click(); await ready(() => document.querySelector('[data-feature-source] a')?.textContent === 'Work');
    expect(document.body.textContent).toContain('company/example');
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.connections.read')).toHaveLength(1);
    expect(document.querySelector('[data-feature-setting]')!.textContent).toContain('desactivada');
    expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.connections.change' || message.method === 'center.confirm')).toBe(false);
});
