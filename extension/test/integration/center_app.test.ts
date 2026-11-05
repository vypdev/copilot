// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { ready, render, button, change, navigate, save } from '../fixtures/center_app_dom.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

it('mounts the actual localized application with all closed routes and saves a single atomic appearance preview through the native gateway', async () => {
    const h = await render(); expect(document.documentElement.lang).toBe('es'); expect(document.title).toBe('Centro de control de Copilot');
    expect(document.querySelectorAll('nav a')).toHaveLength(20); expect(document.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
    await navigate('appearance'); await ready(() => !!document.querySelector('#center-theme'));
    change('center-theme', 'dark'); change('center-density', 'compact'); change('center-text', 'large');
    button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect(h.native.values.has(SETTINGS_KEY)).toBe(false);
    expect([...document.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['center › Apariencia › Tamaño del texto', 'Densidad', 'Tema']);
    await save(); await ready(() => document.querySelector('.center')?.getAttribute('data-theme') === 'dark');
    const stored = await h.native.repository.read(); expect(stored.settings).toMatchObject({ revision: 1, theme: 'dark', density: 'compact', center: { appearance: { text: 'large' } } });
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.confirm')).toHaveLength(1);
    expect((document.querySelector('#center-theme') as HTMLSelectElement).value).toBe('dark');
});
it('retains an unsaved draft when hash navigation is declined and discards it only after an explicit local decision', async () => {
    await render('appearance'); await ready(() => !!document.querySelector('#center-theme')); change('center-theme', 'dark');
    window.location.hash = '#/language'; await ready(() => document.body.textContent?.includes('Tienes un borrador sin guardar.') === true);
    expect(window.location.hash).toBe('#/appearance'); expect(document.querySelector('#center-theme')).not.toBeNull();
    button('Seguir editando').click(); flushSync(); expect(document.querySelector('.notice [type=button]')).toBeNull();
    expect((document.querySelector('#center-theme') as HTMLSelectElement).value).toBe('dark');
    window.location.hash = '#/language'; await ready(() => !!document.querySelector('.notice [type=button]'));
    button('Descartar borrador y salir').click(); await ready(() => !!document.querySelector('#center-locale'));
    expect(window.location.hash).toBe('#/language');
});
it('creates, selects and edits an actual local profile without granting a connection', async () => {
    const h = await render('profiles'); await ready(() => !!document.querySelector('#profile-id'));
    change('profile-id', 'work'); change('profile-name', '<img src=x>'); change('profile-density', 'compact');
    button('Revisar cambio').click(); await save();
    expect(document.querySelector('img')).toBeNull(); expect(document.querySelector('.cards h2')?.textContent).toBe('<img src=x>');
    change('profile-id', 'work'); change('profile-name', 'Do not overwrite');
    expect(button('Usar este perfil').disabled).toBe(true);
    const previewCount = h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview').length;
    button('Revisar cambio').click(); flushSync(); expect(document.querySelector('form [role=alert]')).not.toBeNull();
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview')).toHaveLength(previewCount);
    change('profile-id', ''); change('profile-name', '');
    button('Usar este perfil').click(); await save();
    await navigate('profiles/work'); await ready(() => (document.querySelector('#profile-id') as HTMLInputElement | null)?.readOnly === true
        && document.querySelector<HTMLFieldSetElement>('form fieldset')?.disabled === false);
    change('profile-name', 'Work'); button('Revisar cambio').click(); await save();
    const result = await h.native.repository.read(); expect(result.settings.center.selected).toEqual(['work']);
    expect(result.settings.center.profiles).toEqual([{ id: 'work', name: 'Work', scope: { kind: 'global' }, preferences: { density: 'compact' } }]);
    expect(result.settings.repositories).toEqual({});
});
it('keeps observers read-only until an explicit native takeover', async () => {
    const h = await render('appearance', true); await ready(() => !!document.querySelector('#center-theme'));
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    button('Tomar el control de la edición').click(); await ready(() => (document.querySelector('fieldset') as HTMLFieldSetElement)?.disabled === false);
    expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.claim')).toBe(true);
});
it('authors reviewed profile feature overrides, preserves hidden choices and removes only the selected override through inheritance', async () => {
    const h = await render('profiles'); await ready(() => !!document.querySelector('#profile-feature-filter'));
    change('profile-id', 'work'); change('profile-name', 'Work');
    change('profile-feature-BEX-NAV-01', 'no');
    change('profile-feature-filter', 'BEX-NAV-02');
    expect(document.querySelector('#profile-feature-BEX-NAV-01')).toBeNull();
    change('profile-feature-BEX-NAV-02', 'yes');
    button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect((await h.native.repository.read()).settings.center.profiles).toEqual([]);
    await save();
    expect((await h.native.repository.read()).settings.center.profiles[0].preferences.features).toEqual({ 'BEX-NAV-01': false, 'BEX-NAV-02': true });
    await navigate('profiles/work');
    await ready(() => (document.querySelector('#profile-id') as HTMLInputElement | null)?.readOnly === true
        && document.querySelector<HTMLFieldSetElement>('form fieldset')?.disabled === false
        && !!document.querySelector('#profile-feature-BEX-NAV-01'));
    const first = document.querySelector<HTMLSelectElement>('#profile-feature-BEX-NAV-01')!;
    expect(first.value).toBe('no'); first.selectedIndex = 0; first.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    button('Revisar cambio').click(); await save();
    expect((await h.native.repository.read()).settings.center.profiles[0].preferences.features).toEqual({ 'BEX-NAV-02': true });
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('updates language only after confirmation and applies the complete selected resource', async () => {
    await render('language'); await ready(() => !!document.querySelector('#center-locale'));
    change('center-locale', 'fr'); button('Revisar cambio').click(); expect(document.documentElement.lang).toBe('es');
    await ready(() => !!document.querySelector('#settings-review-heading')); button('Confirmar cambio').click();
    await ready(() => document.documentElement.lang === 'fr'); expect(document.querySelector('h1')?.textContent).toBe('Langue');
    expect(document.title).toBe('Centre de contrôle Copilot'); expect(document.body.textContent).toContain('La modification est enregistrée.');
});
it('reacts only to native background invalidations and settings changes, and closes its native client on teardown', async () => {
    const h = await render(); const baseline = h.port.send.mock.calls.length;
    const notify = [...h.browser.onMessage.listeners][0];
    notify({ version: 1, method: 'center.invalidated' }, { id: 'test', tab: { id: 9 } }, () => undefined);
    notify({ version: 1, method: 'center.invalidated', extra: true }, { id: 'test' }, () => undefined);
    notify({ version: 1, method: 'center.invalidated' }, { id: 'foreign' }, () => undefined);
    expect(h.port.send).toHaveBeenCalledTimes(baseline);
    notify({ version: 1, method: 'center.invalidated' }, { id: 'test' }, () => undefined);
    await ready(() => h.port.send.mock.calls.length > baseline); const reads = h.port.send.mock.calls.length;
    for (const listener of h.browser.changed.listeners) listener({ [SETTINGS_KEY]: {} }, 'local');
    await ready(() => h.port.send.mock.calls.length > reads); h.stop(); h.stop(); await tick();
    expect(h.browser.onMessage.listeners.size).toBe(0); expect(h.browser.changed.listeners.size).toBe(0);
    expect(vi.mocked(h.browser.api.runtime.connect).mock.results[0].value.disconnect).toHaveBeenCalledOnce();
});
it('imports only a bounded validated preferences document and previews it before writing', async () => {
    const h = await render('data'); await ready(() => !!document.querySelector('#center-import'));
    const input = document.querySelector<HTMLInputElement>('#center-import')!;
    const bytes = new TextEncoder().encode(JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'dark', repositories: { '42': { connected: true } } }));
    Object.defineProperty(input, 'files', { value: [{ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }] });
    input.dispatchEvent(new Event('change', { bubbles: true })); flushSync(); expect(button('Revisar preferencias importadas').disabled).toBe(false);
    expect((document.querySelectorAll('fieldset')[1] as HTMLFieldSetElement).disabled).toBe(true);
    // A synthetic FileList does not populate jsdom's native required-input validity state.
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await ready(() => !!document.querySelector('#settings-review-heading')); expect(h.native.values.has(SETTINGS_KEY)).toBe(false);
    expect(input.value).toBe(''); await save(); const stored = await h.native.repository.read();
    expect(stored.settings.theme).toBe('dark'); expect(stored.settings.repositories['42'].connected).toBe(false);
});
it('retains the exact saved fact while a slow read is pending even if the user closes the completed review', async () => {
    const h = await render('appearance'); await ready(() => !!document.querySelector('#center-theme'));
    change('center-theme', 'dark'); button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    const original = h.port.send.getMockImplementation()!; let release: (() => void) | undefined;
    const wait = new Promise<void>(resolve => { release = resolve; }); let reading = false;
    h.port.send.mockImplementation(async message => { if (message.method === 'center.read') { reading = true; await wait; } return original(message); });
    button('Confirmar cambio').click(); await ready(() => reading && document.querySelector('section [role=status]')?.textContent === 'El cambio está guardado.');
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading')); release!();
    await ready(() => (document.querySelector('#center-theme') as HTMLSelectElement).value === 'dark' && document.querySelector('.revision code')?.textContent === '1');
    expect(document.querySelector('form [role=status]')).toBeNull();
    change('center-theme', 'light'); button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    const request = h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview').at(-1)?.[0];
    expect(request).toMatchObject({ expectedRevision: 1 });
});
