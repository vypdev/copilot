// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { ready, render, button, change, save } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { shortcutsCopy } from '../../src/domain/shortcuts_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CENTER_COMMANDS } from '../../src/domain/shortcuts.ts';

const field = (command: string) => document.querySelector<HTMLSelectElement>(`#shortcut-${command}`)!;
const copy = shortcutsCopy('es');
async function open(initial?: unknown, observer = false) {
    const h = await render('shortcuts', observer, initial); await ready(() => !!field('open-help')); return h;
}
it('bexp-CENTER07-C01 reviews global enablement and assignments atomically with localized command deltas before one native save', async () => {
    const h = await open(); document.querySelector<HTMLInputElement>('#shortcuts-enabled')!.click(); flushSync();
    change('shortcut-open-features', 'Alt+Shift+F'); button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect(h.native.port.set).not.toHaveBeenCalled(); expect([...document.querySelectorAll('dt')].map(node => node.textContent)).toContain('Atajos › Funciones');
    expect(document.querySelector('#settings-review-heading')?.parentElement?.textContent).not.toContain('center/bindings');
    await save(); expect((await h.native.repository.read()).settings).toMatchObject({ revision: 1, shortcuts: true,
        center: { bindings: [{ command: 'open-features', binding: 'Alt+Shift+F' }] } });
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('duplicate local chords are explained and rejected before a preview; correcting the draft makes it reviewable', async () => {
    const h = await open(); change('shortcut-open-features', 'Alt+Shift+F'); change('shortcut-open-help', 'Alt+Shift+F');
    expect(document.querySelector('form [role=alert]')?.textContent).toBe(copy.invalid); expect(button('Revisar cambio').disabled).toBe(true);
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.preview')).toBe(false);
    change('shortcut-open-help', 'Alt+Shift+H'); button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('clearing assignments changes only the draft and cancellation retains the saved combinations and unrelated favorites', async () => {
    const initial = { ...DEFAULT_SETTINGS, shortcuts: true, center: { ...DEFAULT_SETTINGS.center, favorites: ['BEX-NAV-01'],
        bindings: [{ command: 'open-help', binding: 'Alt+Shift+H' }] } };
    const h = await open(initial); button(copy.reset).click(); flushSync(); expect(field('open-help').value).toBe('');
    expect((await h.native.repository.read()).settings.center.bindings).toHaveLength(1);
    button('Revisar cambio').click(); await ready(() => !!document.querySelector('#settings-review-heading')); button('Cancelar cambio').click();
    await ready(() => document.querySelector('section [role=status]')?.textContent === 'No se ha realizado ningún cambio.');
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading'));
    expect((await h.native.repository.read()).settings.center.favorites).toEqual(['BEX-NAV-01']); expect(h.native.port.set).not.toHaveBeenCalled();
    button('Revisar cambio').click(); await save(); const saved = (await h.native.repository.read()).settings;
    expect(saved.shortcuts).toBe(true); expect(saved.center.bindings).toEqual([]); expect(saved.center.favorites).toEqual(['BEX-NAV-01']);
});
it('an observer can inspect complete native conflict guidance but cannot submit an edit without native takeover', async () => {
    const h = await open(undefined, true); expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(h.port.send.mock.calls.some(([message]) => message.method === 'center.preview')).toBe(false);
    expect(document.body.textContent).toContain(copy.native); button('Tomar el control de la edición').click();
    await ready(() => !(document.querySelector('fieldset') as HTMLFieldSetElement).disabled);
});
it('an untouched form follows a fresh committed revision; a dirty form keeps its original revision and draft on conflict', async () => {
    const h = await open(); h.native.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 1, center: { ...DEFAULT_SETTINGS.center,
        bindings: [{ command: 'open-help', binding: 'Alt+Shift+H' }] } });
    button('Consultar configuración actual').click(); await ready(() => field('open-help').value === 'Alt+Shift+H');
    change('shortcut-open-help', 'Alt+Shift+J'); h.native.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 2 });
    button('Consultar configuración actual').click(); await ready(() => document.querySelector('form [role=status]') !== null);
    expect(field('open-help').value).toBe('Alt+Shift+J'); button('Revisar cambio').click(); await ready(() => !!document.querySelector('main > [role=alert]'));
    expect(h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview').at(-1)?.[0]).toMatchObject({ expectedRevision: 1 });
    expect(h.native.port.set).not.toHaveBeenCalled();
});
it('dirty shortcut navigation preserves assignments until an explicit discard and does not request native grants', async () => {
    const h = await open(); change('shortcut-open-help', 'Alt+Shift+H'); window.location.hash = '#/appearance';
    await ready(() => !!document.querySelector('.notice [type=button]')); expect(field('open-help').value).toBe('Alt+Shift+H');
    button('Seguir editando').click(); flushSync(); expect(field('open-help').value).toBe('Alt+Shift+H');
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('.notice [type=button]'));
    button('Descartar borrador y salir').click(); await ready(() => !!document.querySelector('#center-theme'));
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it.each(['en', 'es', 'fr', 'pt'] as const)('complete %s shortcut configuration keeps conflict uncertainty and the fixed help route visible', async locale => {
    await render('shortcuts', false, { ...DEFAULT_SETTINGS, locale }, true, centerClientFixture(), locale); await ready(() => !!field('open-help'));
    const local = shortcutsCopy(locale); const center = centerCopy(locale, locale);
    expect(document.body.textContent).toContain(local.native); expect(document.body.textContent).toContain(local.protected);
    expect(document.body.textContent).toContain(local.physical); expect(document.querySelectorAll('kbd')).toHaveLength(3);
    expect(document.querySelectorAll('form select')).toHaveLength(4);
    for (const command of CENTER_COMMANDS) expect(Array.from(field(command).options, option => option.value)).toEqual(['', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `Alt+Shift+${letter}`)]);
    expect(document.querySelector('a[href="https://docs.page/vypdev/copilot/browser-extension/shortcuts"]')?.textContent).toBe(local.guide);
    expect(button(center.messages.preview).disabled).toBe(true); expect(button(local.reset).disabled).toBe(true);
});
it.each([{ schemaVersion: 99 }, { malformed: true }])('unreadable settings %j never become a default editable shortcut form', async initial => {
    const h = await render('shortcuts', false, initial, false); await ready(() => !!document.querySelector('main .notice'));
    expect(document.querySelector('form')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
});
