// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { ready, render, button, change, save } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

it.each([['appearance', 'center-theme', 'dark'], ['language', 'center-locale', 'fr'], ['profiles', 'profile-name', 'Draft profile']])(
    'keeps a %s draft at its original revision when another window saves', async (route, id, value) => {
        const h = await render(route);
        await ready(() => document.getElementById(id)?.matches(':enabled') === true, 'draft field is editable');
        change(id, value);
        if (route === 'profiles') change('profile-id', 'draft');
        await h.native.repository.update(settings => ({ ...settings, paused: true }));
        for (const listener of h.browser.changed.listeners) listener({ [SETTINGS_KEY]: {} }, 'local');
        await ready(() => document.querySelector('form > [role=status]')?.textContent?.includes('Este borrador no se ha reemplazado.') === true
            && document.querySelector('main .revision code')?.textContent === '1', 'external revision and stale draft are visible');
        expect((document.getElementById(id) as HTMLInputElement).value).toBe(value);
        await ready(() => button('Revisar cambio').matches(':enabled'), 'stale draft can request review');
        button('Revisar cambio').click();
        await ready(() => !!document.querySelector('main > [role=alert]'), 'stale review is rejected');
        expect(document.body.textContent).toContain('Se conserva tu borrador'); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    });
it('overview reflects selected profiles and reviews the global pause through the same native gateway', async () => {
    const profile = { id: 'work', name: 'Work', scope: { kind: 'global' }, preferences: {} };
    const h = await render('overview', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['work'] } });
    await ready(() => !!document.querySelector('main > button')); expect(document.body.textContent).not.toContain('No hay ningún perfil seleccionado.');
    (document.querySelector('main > button') as HTMLButtonElement).click(); await save();
    expect((await h.native.repository.read()).settings.paused).toBe(true);
});
it('the skip link moves actual focus, and the native unload warning is present only while a draft needs a decision', async () => {
    await render('appearance'); await ready(() => !!document.querySelector('#center-theme'));
    (document.querySelector('.skip') as HTMLAnchorElement).click(); expect(document.activeElement?.id).toBe('center-main');
    const clean = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
    change('center-theme', 'dark'); const dirty = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(dirty); expect(dirty.defaultPrevented).toBe(true);
});
