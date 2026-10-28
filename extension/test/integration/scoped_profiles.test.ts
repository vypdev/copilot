// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { scopedCenterFixture } from '../fixtures/scoped_center.ts';
import { render, ready, button, change, save } from '../fixtures/center_app_dom.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { flushSync } from 'svelte';

it('creates and selects an organization profile from provider-derived identities and explains the saved preference source', async () => {
    const scoped = await scopedCenterFixture(); const h = await render('profiles', false, undefined, true, scoped.application);
    await ready(() => !!document.querySelector('#profile-id'));
    change('profile-id', 'org'); change('profile-name', '<Org>'); change('profile-scope', 'organization');
    expect(document.querySelector('#profile-account')?.tagName).toBe('SELECT'); change('profile-account', '1'); change('profile-organization', '55');
    change('profile-density', 'compact'); change('profile-shortcuts', 'yes'); button('Revisar cambio').click(); await save();
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('Cómoda');
    button('Usar este perfil').click(); await save();
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('Compacta');
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('<Org>'); expect(document.querySelector('org')).toBeNull();
    expect((await h.native.repository.read()).settings.center.profiles[0].scope).toEqual({ kind: 'organization', host: 'github.com', accountId: '1', organizationId: '55' });
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('preserves an unavailable saved scope while editing its preferences without inventing a connection', async () => {
    const profile = { id: 'old', name: 'Old', scope: { kind: 'repository', host: 'github.com', accountId: '11', repositoryId: '77' }, preferences: {} };
    const h = await render('profiles/old', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile] } });
    await ready(() => !!document.querySelector('#profile-repository'));
    expect(document.querySelector('#profile-account')?.textContent).toContain('Ámbito guardado');
    expect((document.querySelector('#profile-repository') as HTMLSelectElement).value).toBe('77');
    change('profile-density', 'compact'); button('Revisar cambio').click(); await save();
    expect((await h.native.repository.read()).settings.center.profiles[0].scope).toEqual(profile.scope);
    expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('does not retain a repository choice when a different saved account is selected', async () => {
    const scoped = await scopedCenterFixture();
    const stored = scoped.values.get(NAMED_SESSIONS_KEY) as { entries: object[]; revision: number };
    scoped.values.set(NAMED_SESSIONS_KEY, { ...stored, revision: 2, entries: [...stored.entries,
        { id: 'other', name: 'Other', host: 'github.com', role: 'repository-read', connection: { schemaVersion: 1, secret: 'synthetic_other_identity', viewerId: '2', viewerLogin: 'other', repositoryId: '8', repository: 'other/example', organizationId: null } }] });
    await render('profiles', false, undefined, true, scoped.application);
    await ready(() => !!document.querySelector('#profile-id'));
    change('profile-scope', 'repository'); change('profile-account', '1'); change('profile-repository', '7');
    change('profile-account', '2'); expect((document.querySelector('#profile-repository') as HTMLSelectElement).value).toBe('');
    const options = [...document.querySelectorAll<HTMLOptionElement>('#profile-repository option')].map(option => option.value);
    expect(options).toContain('8'); expect(options).not.toContain('7');
});
it('reviews repository pause/reset changes and preserves its protected credential and unrelated inherited pause', async () => {
    const scoped = await scopedCenterFixture();
    const h = await render('repositories', false, { ...DEFAULT_SETTINGS, paused: true, repositories: { '7': { connected: true, density: 'compact' } } }, true, scoped.application);
    await ready(() => !button('Pausar este repositorio').disabled); expect(document.body.textContent).toContain('La pausa global está activa.');
    button('Pausar este repositorio').click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    expect((await h.native.repository.read()).settings.repositories['7'].paused).toBeUndefined();
    button('Cancelar cambio').click(); await ready(() => document.body.textContent?.includes('No se ha realizado ningún cambio.') === true);
    button('Cerrar revisión').click(); await ready(() => !document.querySelector('#settings-review-heading'));
    button('Pausar este repositorio').click(); await save(); expect((await h.native.repository.read()).settings.repositories['7'].paused).toBe(true);
    button('Quitar la pausa de este repositorio').click(); await save(); expect((await h.native.repository.read()).settings.paused).toBe(true);
    button('Revisar restablecimiento del repositorio').click(); await save();
    expect((await h.native.repository.read()).settings.repositories['7']).toEqual({ connected: true });
    expect(scoped.service.status().state).toBe('connected');
});
it('does not let a repository preference review consume an unrelated unsubmitted connection draft', async () => {
    const scoped = await scopedCenterFixture(); const h = await render('repositories', false, undefined, true, scoped.application);
    change('connection-name', 'Unsubmitted draft'); flushSync(); expect(button('Pausar este repositorio').disabled).toBe(true);
    expect(button('Autorizar y conectar').matches(':disabled')).toBe(false);
    const previews = h.port.send.mock.calls.filter(([message]) => message.method === 'center.preview'); expect(previews).toHaveLength(0);
});
it('explains missing saved identities and prevents a new scoped profile from supplying arbitrary numeric input', async () => {
    await render('profiles'); await ready(() => !!document.querySelector('#profile-id'));
    change('profile-id', 'new'); change('profile-name', 'New'); change('profile-scope', 'repository');
    expect(document.body.textContent).toContain('No hay identidades de lectura guardadas disponibles.');
    expect(document.querySelector<HTMLInputElement>('#profile-account')?.tagName).toBe('SELECT');
    expect((document.querySelector('form') as HTMLFormElement).checkValidity()).toBe(false);
});
it('shows a repository preference as the winning saved source only in the selected verified context', async () => {
    const scoped = await scopedCenterFixture(); await render('profiles', false, { ...DEFAULT_SETTINGS, repositories: { '7': { density: 'compact' } } }, true, scoped.application);
    await ready(() => !!document.querySelector('[data-preference=density]'));
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('Preferencia del repositorio');
    expect(document.querySelector('[data-preference=density]')?.textContent).toContain('Compacta');
});
