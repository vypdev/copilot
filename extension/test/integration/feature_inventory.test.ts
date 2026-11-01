// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { ready, render, button, change, navigate, save } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { scopedCenterFixture } from '../fixtures/scoped_center.ts';
import { FEATURE_METADATA } from '../../src/domain/feature_metadata.ts';

const items = () => [...document.querySelectorAll<HTMLElement>('[data-inventory-feature]')];
const detail = (id: string) => document.querySelector(`[data-feature-detail="${id}"]`);
const favorite = (id: string) => document.querySelector<HTMLButtonElement>(`[data-feature-favorite="${id}"]`)!;
async function inventory(initial?: unknown) { const h = await render('features', false, initial); await ready(() => !!document.querySelector('#inventory-search')); return h; }
async function open(id: string, initial?: unknown, observer = false) { const h = await render(`features/${id}`, observer, initial); await ready(() => !!detail(id)); return h; }
function submit(): void { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); flushSync(); }
it('bexh3-center-C25/C34 renders and searches the complete150 locally, announces counts and provides bounded keyboard-accessible pages', async () => {
    const h = await inventory(); expect(items()).toHaveLength(25); expect(document.querySelector('#inventory-results')!.textContent).toContain('150 resultados');
    expect(document.querySelector('#inventory-results')!.getAttribute('aria-live')).toBe('polite'); expect(button('Resultados anteriores').disabled).toBe(true);
    button('Resultados siguientes').click(); await ready(() => items()[0]?.dataset.inventoryFeature === 'BEX-CODE-14');
    button('Resultados anteriores').click(); await ready(() => items()[0]?.dataset.inventoryFeature === 'BEX-NAV-01');
    change('inventory-search', 'configuracion efectiva'); await ready(() => items().some(item => item.dataset.inventoryFeature === 'BEX-SETUP-03'));
    change('inventory-search', 'bex-nav-12'); await ready(() => items().length === 1); expect(items()[0].dataset.inventoryFeature).toBe('BEX-NAV-12');
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('combines family, surface, mode, required access, implementation and saved preference filters with explicit empty/reset states', async () => {
    await inventory(); change('inventory-family', 'NAV'); await ready(() => items().length === 12);
    change('inventory-family', ''); await ready(() => items().length === 25); change('inventory-family', 'NAV');
    change('inventory-surface', 'issue'); await ready(() => items().length < 12); expect(items().map(x => x.dataset.inventoryFeature)).toContain('BEX-NAV-02');
    change('inventory-mode', 'read'); change('inventory-permission', 'selected-repository-read'); change('inventory-phase', 'later'); change('inventory-setting', 'disabled');
    await ready(() => items().length === 1); expect(items()[0].dataset.inventoryFeature).toBe('BEX-NAV-12');
    change('inventory-source', 'profile'); await ready(() => items().length === 0); expect(document.body.textContent).toContain('Ninguna función coincide');
    button('Limpiar búsqueda y filtros').click(); await ready(() => items().length === 25); expect(document.querySelector('#inventory-results')!.textContent).toContain('150 resultados');
    const query = document.querySelector<HTMLInputElement>('#inventory-search')!; expect(query.maxLength).toBe(200); query.focus(); change('inventory-search', 'XYZ_no_match');
    expect(document.activeElement).toBe(query);
});
it('bexp-CENTER02-C01/C03 retains search, filters and page in this center instance when visiting a lazy detail and returning', async () => {
    await inventory(); change('inventory-mode', 'settings'); button('Resultados siguientes').click(); await ready(() => document.querySelector('#inventory-results')!.textContent!.includes('26–'));
    const first = items()[0].dataset.inventoryFeature!; await navigate(`features/${first}`); await ready(() => !!detail(first));
    expect(document.querySelector('#inventory-search')).toBe(null);
    await navigate('features'); await ready(() => !!document.querySelector('#inventory-search'));
    expect((document.querySelector('#inventory-mode') as HTMLSelectElement).value).toBe('settings'); expect(items()[0].dataset.inventoryFeature).toBe(first);
    change('inventory-family', 'CENTER'); await ready(() => items().length === 14); expect(document.querySelector('#inventory-results')!.textContent).toContain('1–14');
});
it('favorites are reviewed, persist only known local IDs and filter the complete inventory without requesting access', async () => {
    const h = await inventory(); favorite('BEX-NAV-01').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect(h.native.port.set).not.toHaveBeenCalled(); await save(); expect((await h.native.repository.read()).settings.center.favorites).toEqual(['BEX-NAV-01']);
    await ready(() => favorite('BEX-NAV-01').getAttribute('aria-pressed') === 'true');
    const check = document.querySelector<HTMLInputElement>('input[type=checkbox]')!; check.checked = true; check.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    await ready(() => items().length === 1); favorite('BEX-NAV-01').click(); await save(); await ready(() => items().length === 0);
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('capacity20 blocks only additions and a removed favorite makes room without destroying the other19', async () => {
    const favorites = FEATURE_METADATA.slice(0, 20).map(feature => feature.id);
    const h = await inventory({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, favorites } });
    expect(favorite('BEX-CODE-09').disabled).toBe(true); expect(favorite('BEX-NAV-01').disabled).toBe(false); expect(document.body.textContent).toContain('hasta 20 favoritos');
    favorite('BEX-NAV-01').click(); await save(); expect((await h.native.repository.read()).settings.center.favorites).toHaveLength(19);
    await ready(() => !favorite('BEX-CODE-09').disabled);
    expect(favorite('BEX-CODE-09').disabled).toBe(false);
});
it.each(['en', 'es', 'fr', 'pt'] as const)('complete %s detail localizes purpose, current development status, privacy and review without a remote implementation', async locale => {
    const h = await open('BEX-CENTER-08', { ...DEFAULT_SETTINGS, locale });
    expect(document.querySelector('.center')!.getAttribute('lang')).toBe(locale); expect(detail('BEX-CENTER-08')!.textContent).toContain('H3');
    expect(detail('BEX-CENTER-08')!.querySelector('a[href="#/data"]')).not.toBe(null);
    expect(detail('BEX-CENTER-08')!.querySelector('details a')!.getAttribute('href')).toContain('/features/CENTER.v1.json');
    expect(document.querySelector('[data-feature-source]')!.textContent).toBeTruthy(); expect(document.querySelector('form fieldset')!.hasAttribute('disabled')).toBe(false);
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('bexp-CENTER02-C02 separates later implementation, required access, optional permissions and enabled preferences without invoking a monitor', async () => {
    const h = await open('BEX-NOTIFY-06'); const body = detail('BEX-NOTIFY-06')!;
    expect(body.textContent).toContain('H6'); expect(body.textContent).toContain('Safari usa centro o barra');
    expect(body.querySelector('a[href="https://github.com/vypdev/copilot/issues/707"]')).not.toBe(null);
    expect([...body.querySelectorAll('details code')].map(x => x.textContent)).toEqual(expect.arrayContaining(['alarms', 'notifications']));
    expect(body.querySelector('a[href="#/attention"]')).toBe(null); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
    expect(h.port.send.mock.calls.some(([m]) => m.method === 'center.connections.change')).toBe(false);
});
it('global feature changes and explicit inheritance retain other preferences and cannot enable a future implementation', async () => {
    const initial = { ...DEFAULT_SETTINGS, features: { 'BEX-NAV-02': false } }; const h = await open('BEX-NAV-01', initial);
    change('feature-global-preference', 'disabled'); expect(favorite('BEX-NAV-01').disabled).toBe(true);
    favorite('BEX-NAV-01').disabled = false; favorite('BEX-NAV-01').click();
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.preview')).toHaveLength(0); submit(); await save();
    expect((await h.native.repository.read()).settings.features).toEqual({ 'BEX-NAV-02': false, 'BEX-NAV-01': false });
    expect(document.querySelector('[data-feature-setting]')!.textContent).toContain('desactivada'); expect(detail('BEX-NAV-01')!.textContent).toContain('H4');
    change('feature-global-preference', 'enabled'); submit(); await save(); expect((await h.native.repository.read()).settings.features['BEX-NAV-01']).toBe(true);
    change('feature-global-preference', ''); submit(); await save(); expect((await h.native.repository.read()).settings.features).toEqual({ 'BEX-NAV-02': false });
});
it('an inherited pause remains visible after saving enabled and global source is not presented as authorization', async () => {
    const h = await open('BEX-NAV-01', { ...DEFAULT_SETTINGS, paused: true, features: { 'BEX-NAV-01': false } });
    expect((document.querySelector('#feature-global-preference') as HTMLSelectElement).value).toBe('disabled');
    change('feature-global-preference', 'enabled'); submit(); await save();
    expect((await h.native.repository.read()).settings.paused).toBe(true); expect(document.querySelector('[data-feature-setting]')!.textContent).toContain('Pausa');
    expect(document.body.textContent).toContain('no certifica un permiso');
});
it('bexh3-center-C35 verified selected profile provenance links only to a closed local profile and renders its name as text', async () => {
    const scoped = await scopedCenterFixture(); const profile = { id: 'work', name: '<img src=x> Work', scope: { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' }, preferences: { features: { 'BEX-NAV-01': false } } };
    const app = await render('features/BEX-NAV-01', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['work'] } }, true, scoped.application);
    await ready(() => document.querySelector('[data-feature-source] a') !== null);
    const source = document.querySelector('[data-feature-source]')!; expect(source.textContent).toContain('<img src=x> Work'); expect(source.querySelector('img')).toBe(null);
    expect(source.querySelector('a')!.getAttribute('href')).toBe('#/profiles/work'); expect(document.body.textContent).toContain('company/example');
    expect(document.querySelector('[data-feature-setting]')!.textContent).toContain('desactivada');
    await navigate('features'); await ready(() => !!document.querySelector('#inventory-profile')); change('inventory-profile', 'work');
    await ready(() => items().length === 1); expect(items()[0].dataset.inventoryFeature).toBe('BEX-NAV-01');
    await scoped.service.revoke();
    for (const listener of app.browser.onMessage.listeners) listener({ version: 1, method: 'center.invalidated' }, { id: 'test' }, () => undefined);
    await ready(() => items().length === 0); expect(document.body.textContent).not.toContain('company/example');
    for (const listener of scoped.application.port.send.mock.calls) expect(JSON.stringify(listener)).not.toContain('synthetic_not_a_real_credential');
});
it('observer views can browse but queued preference/favorite gestures cannot request mutation', async () => {
    const h = await open('BEX-NAV-01', undefined, true); const writes = () => h.port.send.mock.calls.filter(([m]) => m.method === 'center.preview');
    expect(favorite('BEX-NAV-01').disabled).toBe(true); favorite('BEX-NAV-01').disabled = false; favorite('BEX-NAV-01').click(); submit();
    expect(writes()).toHaveLength(0); expect(document.querySelector('form fieldset')!.hasAttribute('disabled')).toBe(true);
});
it('dirty feature preferences guard navigation and survive a canceled review, then discard explicitly without storing', async () => {
    const h = await open('BEX-NAV-01'); change('feature-global-preference', 'disabled'); window.location.hash = '#/appearance';
    await vi.waitFor(() => expect(document.querySelector('section[role=alert]'), 'first guarded navigation').not.toBe(null));
    button('Seguir editando').click(); await vi.waitFor(() => expect(document.querySelector('section[role=alert]'), 'stay closes navigation alert').toBe(null));
    expect((document.querySelector('#feature-global-preference') as HTMLSelectElement).value).toBe('disabled'); submit();
    await ready(() => !!document.querySelector('#settings-review-heading')); button('Cancelar cambio').click();
    await vi.waitFor(() => expect(document.querySelector('section [role=status]')?.textContent, 'cancel review').toBe('No se ha realizado ningún cambio.')); button('Cerrar revisión').click();
    await ready(() => !document.querySelector('#settings-review-heading')); expect((document.querySelector('#feature-global-preference') as HTMLSelectElement).value).toBe('disabled');
    window.location.hash = '#/appearance'; await vi.waitFor(() => expect(document.querySelector('section[role=alert]'), 'second guarded navigation').not.toBe(null));
    button('Descartar borrador y salir').click(); await vi.waitFor(() => expect(document.querySelector('#center-theme'), 'discard opens requested route').not.toBe(null));
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a stale session projection is cleared after the native credential epoch changes before profile provenance can survive refresh', async () => {
    const scoped = await scopedCenterFixture(); const client = scoped.application.client; await client.start(); await client.connections();
    expect(client.view.connections).toMatchObject({ state: 'ready', connected: true }); await scoped.service.revoke(); await client.refresh();
    expect(client.view.connections).toBe(null); client.stop();
});

it('an invalid native select value and a reenabled capacity button cannot request an arbitrary or overflowing preference change', async () => {
    const favorites = FEATURE_METADATA.slice(0, 20).map(feature => feature.id);
    const h = await open('BEX-CODE-09', { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, favorites } });
    favorite('BEX-CODE-09').disabled = false; favorite('BEX-CODE-09').click(); change('feature-global-preference', 'grant'); submit();
    expect(h.port.send.mock.calls.filter(([m]) => m.method === 'center.preview')).toHaveLength(0);
});
it('a connection response from before revocation cannot restore stale profile context after its final settings read', async () => {
    const scoped = await scopedCenterFixture(); const h = scoped.application; await h.client.start();
    const original = h.port.send.getMockImplementation()!; let release!: (value: unknown) => void; let captured: unknown;
    h.port.send.mockImplementation(async message => {
        if (message.method !== 'center.connections.read') return original(message);
        captured = await original(message); return new Promise(resolve => { release = resolve; });
    });
    const read = h.client.connections(); await vi.waitFor(() => expect(release).toBeTypeOf('function')); await scoped.service.revoke(); release(captured);
    await read; expect(h.client.view.connections).toBe(null); h.client.stop();
});

it('native invalidation clears private profile context before a delayed refresh and rereads it once the current document is ready', async () => {
    const scoped = await scopedCenterFixture(); const h = scoped.application;
    const profile = { id: 'work', name: 'Work', scope: { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' }, preferences: { features: { 'BEX-NAV-01': false } } };
    const app = await render('features/BEX-NAV-01', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['work'] } }, true, h);
    await ready(() => document.body.textContent?.includes('company/example') === true);
    const original = h.port.send.getMockImplementation()!; let release!: (value: unknown) => void; let current: unknown;
    h.port.send.mockImplementationOnce(async message => { current = await original(message); return new Promise(resolve => { release = resolve; }); });
    for (const listener of app.browser.onMessage.listeners) listener({ version: 1, method: 'center.invalidated' }, { id: 'test' }, () => undefined);
    flushSync(); expect(document.body.textContent).not.toContain('company/example');
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); release(current);
    await ready(() => document.body.textContent?.includes('company/example') === true);
});
it('closing a client discards its private connection projection and queued invalidations cannot revive it', async () => {
    const scoped = await scopedCenterFixture(); const h = scoped.application; await h.client.start(); await h.client.connections();
    h.client.stop(); expect(h.client.view.connections).toBe(null); const closed = h.client.view; h.client.invalidateConnections(); expect(h.client.view).toBe(closed);
});

it('the inventory displays inherited pause distinctly while keeping future implementations and recovery tools visible', async () => {
    await inventory({ ...DEFAULT_SETTINGS, paused: true }); expect(items()[0].textContent).toContain('Pausa de ajustes heredados');
    change('inventory-setting', 'paused'); await ready(() => document.querySelector('#inventory-results')!.textContent!.includes('150 resultados'));
});
