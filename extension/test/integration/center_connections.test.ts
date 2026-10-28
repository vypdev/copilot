// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { button, change, ready, render } from '../fixtures/center_app_dom.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { CENTER_BINDING } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';

async function mounted(initial?: unknown) {
    const h = namedSessionsFixture(); const app = await render('connections', false, initial, initial === undefined, centerClientFixture(h.center));
    await ready(() => !button('Autorizar y conectar').matches(':disabled')); return { ...h, app };
}
function fill(name = 'Trabajo') {
    change('connection-name', name); change('connection-repository', 'octo/example'); change('connection-secret', CONNECTION_INPUT.secret);
}
it('connects from the actual Svelte form with permission as the first API call and no credential in the public view or backup preferences', async () => {
    const h = await mounted(); const grant = deferred<boolean>();
    vi.mocked(h.app.browser.api.permissions.request).mockReturnValueOnce(grant.promise); fill('<img src=x>');
    const sends = h.app.port.send.mock.calls.length; button('Autorizar y conectar').click(); flushSync();
    expect(h.app.browser.api.permissions.request).toHaveBeenCalledWith({ origins: ['https://api.github.com/*'] });
    expect((document.querySelector('#connection-secret') as HTMLInputElement).value).toBe('');
    expect(h.app.port.send).toHaveBeenCalledTimes(sends); expect(h.reader.read).not.toHaveBeenCalled();
    expect(button('Autorizar y conectar').matches(':disabled')).toBe(true); grant.resolve(true);
    await ready(() => document.querySelector('.cards h3')?.textContent === '<img src=x>');
    expect(document.querySelector('img')).toBeNull(); expect(document.body.textContent).toContain('octo/example');
    expect(document.body.textContent).not.toContain(CONNECTION_INPUT.secret);
    expect(h.app.port.send.mock.calls.find(([message]) => message.method === 'center.connections.change')?.[0]).toMatchObject({ expectedRevision: 0 });
    expect(h.service.status().state).toBe('connected'); expect(h.namedPorts.connected).toHaveBeenCalledWith('7', expect.any(Function));
    expect(JSON.stringify((await h.center.repository.read()).settings)).not.toContain(CONNECTION_INPUT.secret);
    expect((document.querySelector('#connection-name') as HTMLInputElement).value).toBe('');
});
it('denied or failed browser permission clears the credential and never sends it to the background', async () => {
    const h = await mounted(); vi.mocked(h.app.browser.api.permissions.request).mockResolvedValueOnce(false); fill();
    button('Autorizar y conectar').click(); await ready(() => !!document.querySelector('section [role=alert]'));
    expect((document.querySelector('#connection-secret') as HTMLInputElement).value).toBe('');
    expect(h.app.port.send.mock.calls.some(([message]) => message.method === 'center.connections.change')).toBe(false);
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.reader.read).not.toHaveBeenCalled();
    button('Leer sesiones actuales').click(); await ready(() => !button('Autorizar y conectar').matches(':disabled'));
    vi.mocked(h.app.browser.api.permissions.request).mockRejectedValueOnce(new Error('private native details')); fill();
    button('Autorizar y conectar').click(); await ready(() => document.body.textContent?.includes('No se ha podido verificar') === true);
    expect(document.body.textContent).not.toContain('private native details');
});
it('removes a named protected credential only after a visible exact-entry confirmation, and permits keeping it', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    await render('connections', false, undefined, true, centerClientFixture(h.center)); await ready(() => !!document.querySelector('.cards h3'));
    button('Eliminar sesión').click(); flushSync(); expect(document.body.textContent).toContain('Esto no revoca la credencial en GitHub.');
    expect(h.values.has(SESSION_KEY)).toBe(true); button('Conservar sesión').click(); flushSync(); expect(h.values.has(SESSION_KEY)).toBe(true);
    button('Eliminar sesión').click(); flushSync(); button('Confirmar eliminación').click();
    await ready(() => document.body.textContent?.includes('No hay sesiones con nombre.') === true);
    expect(h.values.has(SESSION_KEY)).toBe(false); expect(JSON.stringify(h.values.get(NAMED_SESSIONS_KEY))).not.toContain(CONNECTION_INPUT.secret);
});
it.each(['future', 'corrupt'] as const)('keeps verified session inspection and disconnect available when preferences are %s', async state => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const initial = state === 'future' ? { ...DEFAULT_SETTINGS, schemaVersion: 999 } : { broken: true };
    await render('connections', false, initial, false, centerClientFixture(h.center)); await ready(() => !!document.querySelector('.cards h3'));
    expect(document.querySelector('#center-theme')).toBeNull(); expect(button('Desconectar sesión seleccionada').disabled).toBe(false);
    button('Desconectar sesión seleccionada').click(); await ready(() => document.body.textContent?.includes('No hay sesiones con nombre.') === true);
    expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('does not send a late credential after the options page closes while the native permission dialog is pending', async () => {
    const h = await mounted(); const grant = deferred<boolean>(); vi.mocked(h.app.browser.api.permissions.request).mockReturnValueOnce(grant.promise);
    fill(); button('Autorizar y conectar').click(); h.app.stop(); grant.resolve(true);
    await vi.waitFor(() => expect(h.app.port.send.mock.calls.at(-1)?.[0].method).toBe('center.close'));
    expect(h.app.port.send.mock.calls.some(([message]) => message.method === 'center.connections.change')).toBe(false);
    expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('rejects the old controller after a takeover during the permission gesture, without reusing the credential or issuing provider reads', async () => {
    const h = await mounted(); const grant = deferred<boolean>(); vi.mocked(h.app.browser.api.permissions.request).mockReturnValueOnce(grant.promise);
    fill(); button('Autorizar y conectar').click();
    const otherBinding = { ...CENTER_BINDING, documentId: 'other', tabId: 2 }; const other = h.center.open(otherBinding);
    h.center.controller.claim(other.clientId, otherBinding, other.controllerEpoch); grant.resolve(true);
    await ready(() => document.body.textContent?.includes('Ha cambiado el controlador o la cuenta.') === true);
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('reports uncertain transport without repeating the accepted connection, then reads the actual protected result explicitly', async () => {
    const h = await mounted(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async message => {
        const result = await send(message); if (message.method === 'center.connections.change') throw new Error('private transport'); return result;
    });
    fill(); button('Autorizar y conectar').click(); await ready(() => document.body.textContent?.includes('La respuesta no confirma qué se guardó.') === true);
    expect(h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.connections.change')).toHaveLength(1);
    button('Leer sesiones actuales').click(); await ready(() => document.querySelector('.cards h3')?.textContent === 'Trabajo');
    expect(h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.connections.change')).toHaveLength(1);
});
it('clears the native credential even when permission acquisition throws synchronously', async () => {
    const h = await mounted(); vi.mocked(h.app.browser.api.permissions.request).mockImplementationOnce(() => { throw new Error('private native failure'); });
    fill(); button('Autorizar y conectar').click(); await ready(() => document.body.textContent?.includes('No se ha podido verificar') === true);
    expect((document.querySelector('#connection-secret') as HTMLInputElement).value).toBe(''); expect(h.reader.read).not.toHaveBeenCalled();
});
it('keeps emergency forgetting explicit and available when the named-session schema is unreadable', async () => {
    const h = namedSessionsFixture(); h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 999, private: 'retained' });
    await render('connections', false, undefined, true, centerClientFixture(h.center));
    await ready(() => !button('Olvidar todas las sesiones protegidas').disabled);
    const secret = document.querySelector<HTMLInputElement>('#connection-secret')!; secret.value = 'synthetic_unsubmitted_credential';
    button('Olvidar todas las sesiones protegidas').click(); flushSync(); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(true);
    expect(document.body.textContent).toContain('incluso un registro ilegible'); button('Conservar sesión').click(); flushSync();
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(true); button('Olvidar todas las sesiones protegidas').click(); flushSync();
    button('Confirmar olvido de todas las sesiones').click(); await ready(() => document.body.textContent?.includes('No hay sesiones con nombre.') === true);
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(secret.value).toBe('');
});
it('switches the selected verified session from the actual list and refreshes its unchanged identities without changing purpose', async () => {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    await h.connections.change({ ...CONNECTION_INPUT, name: 'Personal', secret: 'synthetic_personal_credential' }, 1, h.current);
    await render('repositories', false, undefined, true, centerClientFixture(h.center)); await ready(() => document.querySelectorAll('.cards h3').length === 2);
    button('Verificar y seleccionar').click(); await ready(() => (h.values.get(NAMED_SESSIONS_KEY) as { selected: string }).selected === 'session-1');
    await ready(() => !button('Leer sesiones actuales').disabled); button('Leer sesiones actuales').click();
    await ready(() => !button('Leer sesiones actuales').disabled); expect(document.querySelectorAll('.cards li')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('synthetic_personal_credential');
});
it('loads the session manager after an explicitly discarded preference draft enters Connections without a second hash event', async () => {
    const h = namedSessionsFixture(); await render('appearance', false, undefined, true, centerClientFixture(h.center));
    await ready(() => !!document.querySelector('#center-theme')); change('center-theme', 'dark');
    window.location.hash = '#/connections'; await ready(() => document.body.textContent?.includes('Tienes un borrador sin guardar.') === true);
    button('Descartar borrador y salir').click();
    await ready(() => document.querySelector('#connection-secret') !== null && !button('Autorizar y conectar').matches(':disabled'));
});
