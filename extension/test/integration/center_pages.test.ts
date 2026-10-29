// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { ready, render, button, change, save } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { supportCopy } from '../../src/domain/support_copy.ts';
import { scopedCenterFixture } from '../fixtures/scoped_center.ts';

it('reviews all appearance preferences and cancels without persisting or erasing the form', async () => {
    const h = await render('appearance'); await ready(() => !!document.querySelector('#center-motion'));
    for (const [id, value] of [['center-theme', 'light'], ['center-density', 'compact'], ['center-text', 'large'], ['center-motion', 'reduced'], ['center-contrast', 'high']]) change(id, value);
    button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect(document.querySelectorAll('dt')).toHaveLength(5); button('Cancelar cambio').click();
    await ready(() => document.querySelector('section [role=status]')?.textContent === 'No se ha realizado ningún cambio.');
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading'));
    expect(h.native.port.set).not.toHaveBeenCalled(); expect((document.querySelector('#center-motion') as HTMLSelectElement).value).toBe('reduced');
});
it.each(['account', 'organization', 'repository'] as const)('edits a %s preference profile with saved provider identities and explicit false overrides', async kind => {
    const scoped = await scopedCenterFixture('7', '8', '8');
    const h = await render('profiles', false, undefined, true, scoped.application); await ready(() => !!document.querySelector('#profile-id'));
    change('profile-id', 'work'); change('profile-name', 'Work'); change('profile-scope', kind);
    change('profile-account', '7'); if (kind !== 'account') change(`profile-${kind}`, '8');
    change('profile-density', 'compact'); change('profile-paused', 'no'); change('profile-shortcuts', 'yes');
    button('Revisar cambio').click(); await save();
    const current = await h.native.repository.read(); expect(current.settings.center.profiles[0]).toMatchObject({ scope: { kind, accountId: '7' }, preferences: { density: 'compact', paused: false, shortcuts: true } });
});
it('keeps a missing profile inert and prevents creation beyond the fixed profile limit', async () => {
    await render('profiles/missing'); await ready(() => !!document.querySelector('main [role=alert]'));
    expect(document.querySelector('form')).toBeNull();
});
it('at capacity retains existing profiles and disables only the new profile form', async () => {
    const profiles = Array.from({ length: 10 }, (_, index) => ({ id: `work-${index}`, name: `Work ${index}`, scope: { kind: 'global' }, preferences: {} }));
    await render('profiles', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles } });
    await ready(() => !!document.querySelector('#profile-id'));
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true); expect(document.querySelectorAll('.cards li')).toHaveLength(10);
    expect(button('Eliminar perfil').disabled).toBe(false);
});
it('deselects and removes profiles only through their distinct reviewed changes', async () => {
    const profile = { id: 'work', name: 'Work', scope: { kind: 'host', host: 'github.com' }, preferences: {} };
    const h = await render('profiles', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['work'] } });
    await ready(() => !!document.querySelector('.cards li')); button('Dejar de usar este perfil').click(); await save();
    expect((await h.native.repository.read()).settings.center.selected).toEqual([]);
    button('Eliminar perfil').click(); await save(); expect((await h.native.repository.read()).settings.center.profiles).toEqual([]);
});
it.each(['global', 'profiles', 'appearance', 'all'])('previews and applies the explicit %s reset without an unreviewed write', async scope => {
    const initial = { ...DEFAULT_SETTINGS, theme: 'dark', center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: 'Work', scope: { kind: 'global' }, preferences: {} }] } };
    const h = await render('data', false, initial); await ready(() => !!document.querySelector('#center-reset')); change('center-reset', scope);
    button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading')); expect(h.native.port.set).not.toHaveBeenCalled(); await save();
    const current = await h.native.repository.read(); expect(current.settings.revision).toBe(1);
    expect(current.settings.center.profiles.length).toBe(scope === 'all' || scope === 'profiles' ? 0 : 1);
});
it('reviews rollback as a new change and reports an unreadable file without sending a settings mutation', async () => {
    const h = await render('data', false, { current: { ...DEFAULT_SETTINGS, revision: 1, theme: 'dark' }, previous: DEFAULT_SETTINGS });
    await ready(() => !!document.querySelector('#center-reset')); button('Revisar preferencias anteriores').click(); await save();
    expect((await h.native.repository.read()).settings).toMatchObject({ revision: 2, theme: 'github' });
    const input = document.querySelector<HTMLInputElement>('#center-import')!; const bytes = new TextEncoder().encode('{');
    Object.defineProperty(input, 'files', { value: [{ size: bytes.length, arrayBuffer: async () => bytes.buffer }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync(); input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await ready(() => document.body.textContent?.includes('No se ha podido leer el archivo') === true);
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
});
it('reports a failed download and still allows a later explicit export', async () => {
    await render('data'); await ready(() => !!document.querySelector('#center-reset'));
    vi.stubGlobal('URL', { createObjectURL: () => { throw new Error('private-download-error'); }, revokeObjectURL() {} });
    button('Exportar preferencias locales').click(); await ready(() => document.body.textContent?.includes('No se ha podido descargar') === true);
    expect(document.body.textContent).not.toContain('private-download-error');
});
it.each(['help', 'about', 'recovery', 'work'])('opens the %s route with useful information and honest unfinished-state copy', async route => {
    await render(route); await ready(() => route === 'work' ? document.querySelector('main a')?.textContent === 'Abrir documentación' : !!document.querySelector('[data-support-status]'));
    if (route === 'work') expect(document.body.textContent).toContain('Esta sección sigue en desarrollo');
    else expect(document.body.textContent).toContain(supportCopy('es').safety);
    if (route === 'recovery') [...document.querySelectorAll('button')].filter(node => node.textContent === 'Consultar configuración actual').at(-1)!.click();
});
it('welcome completion is an explicit reviewed preference, rather than an implied connection or product acceptance', async () => {
    const h = await render('welcome'); await ready(() => !!document.querySelector('[data-welcome-step]'));
    expect(document.querySelector('main a')?.getAttribute('href')).toBe('#/features'); button('Revisar avance al siguiente paso').click(); await save();
    expect((await h.native.repository.read()).settings.center.onboarding).toBe('profile'); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it.each([{ schemaVersion: 99 }, { schemaVersion: 2, broken: true }])('keeps unsupported or corrupt saved data inert instead of rendering editable defaults', async initial => {
    const h = await render('recovery', false, initial, false); await ready(() => !!document.querySelector('main .notice'));
    expect(document.querySelector('form')).toBeNull(); expect(document.querySelector('.revision')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('conserv');
});
