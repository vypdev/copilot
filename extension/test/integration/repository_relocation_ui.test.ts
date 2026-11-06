// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { button, change, ready, render } from '../fixtures/center_app_dom.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { relocationCopy } from '../../src/domain/relocation_copy.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { deferred } from '../fixtures/runtime.ts';
async function mounted(locale: 'en' | 'es' | 'fr' | 'pt' = 'en', initial?: unknown, observer = false) {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const app = await render('connections', observer, initial, initial === undefined, centerClientFixture(h.center), locale);
    const copy = relocationCopy(locale); await ready(() => !!document.querySelector('#connections-heading') && !!document.querySelector('.cards h3'));
    const prior = vi.mocked(h.reader.read).mock.calls.length;
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 12,
        data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'team/renamed', organizationId: '20' } }));
    return { ...h, app, copy, prior, open: () => { button(copy.open).click(); flushSync(); },
        edit: () => change('relocation-address', 'team/renamed'),
        review: () => { button(copy.review).click(); flushSync(); } };
}
it.each(['en', 'es', 'fr', 'pt'] as const)('reviews the new address in %s before reusing only the original protected read identity', async locale => {
    const h = await mounted(locale); h.open(); h.edit(); h.review();
    expect(h.reader.read).toHaveBeenCalledTimes(h.prior); expect(document.querySelector('[data-relocation-review]')?.textContent).toContain('team/renamed');
    expect(document.querySelector('[data-repository-relocation]')?.textContent).toContain(h.copy.hint);
    button(h.copy.confirm).click(); await ready(() => !document.querySelector('[data-repository-relocation]'));
    expect(h.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ revision: 2, entries: [{ role: 'repository-read', connection: { repository: 'team/renamed', repositoryId: '7' } }] });
    expect(h.app.browser.api.permissions.request).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain(CONNECTION_INPUT.secret);
    expect(h.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(1);
});
it('keeps editing and discard side-effect free while disabling unrelated session mutations', async () => {
    const h = await mounted(); h.open(); h.edit(); h.review(); button(h.copy.editing).click(); flushSync();
    expect(document.querySelector('[data-relocation-review]')).toBeNull(); expect(button('Remove session').disabled).toBe(true);
    expect(button('Forget all protected sessions').disabled).toBe(true); expect(button('Authorize and connect').matches(':disabled')).toBe(true);
    expect((document.querySelector('#relocation-address') as HTMLInputElement).value).toBe('team/renamed');
    button(h.copy.cancel).click(); flushSync(); expect(document.querySelector('[data-repository-relocation]')).toBeNull();
    expect(h.reader.read).toHaveBeenCalledTimes(h.prior); expect(button(h.copy.open).disabled).toBe(false);
});
it('rejects an unsafe typed address even if form submission is dispatched programmatically', async () => {
    const h = await mounted(); h.open(); change('relocation-address', '../other');
    document.querySelector('[data-repository-relocation] form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); flushSync();
    expect(button(h.copy.review).disabled).toBe(true); expect(document.querySelector('[data-relocation-review]')).toBeNull(); expect(h.reader.read).toHaveBeenCalledTimes(h.prior);
});
it('one accepted verification with a missing response retains the address and requires an explicit read/new review', async () => {
    const h = await mounted(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async m => { const value = await send(m); if (m.method === 'center.connections.change') throw new Error('private response'); return value; });
    h.open(); h.edit(); h.review(); button(h.copy.confirm).click(); await ready(() => document.body.textContent?.includes(h.copy.unknown) === true);
    expect((document.querySelector('#relocation-address') as HTMLInputElement).value).toBe('team/renamed'); expect(button(h.copy.review).disabled).toBe(true);
    button('Read current sessions').click(); await ready(() => !button(h.copy.review).disabled); h.review();
    expect(document.querySelector('[data-relocation-review]')).not.toBeNull(); expect(h.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('private response');
});
it('keeps the draft across stay, then actually discards it on confirmed navigation between the two session routes', async () => {
    const h = await mounted(); h.open(); h.edit(); window.location.hash = '#/repositories';
    await ready(() => !!document.querySelector('[data-navigation-guard]') || document.body.textContent?.includes('unsaved draft') === true);
    button('Keep editing').click(); flushSync(); expect((document.querySelector('#relocation-address') as HTMLInputElement).value).toBe('team/renamed');
    window.location.hash = '#/repositories'; await ready(() => document.body.textContent?.includes('unsaved draft') === true);
    button('Discard draft and leave').click(); await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#/repositories');
    expect(document.querySelector('[data-repository-relocation]')).toBeNull(); expect(h.reader.read).toHaveBeenCalledTimes(h.prior);
});
it('does not offer a second editor over an existing unsubmitted connection draft', async () => {
    const h = await mounted(); change('connection-name', 'Other'); expect(button(h.copy.open).disabled).toBe(true);
    button(h.copy.open).click(); flushSync(); expect(document.querySelector('[data-repository-relocation]')).toBeNull();
});
it('an observer cannot open recovery or supply another repository address', async () => {
    const h = await mounted('en', undefined, true); expect(button(h.copy.open).disabled).toBe(true);
    button(h.copy.open).click(); expect(document.querySelector('[data-repository-relocation]')).toBeNull(); expect(h.reader.read).toHaveBeenCalledTimes(h.prior);
});
it('coalesces repeated confirmation while the selected address is being verified', async () => {
    const h = await mounted(); const gate = deferred<void>(); const entered = deferred<void>(); const read = vi.mocked(h.reader.read).getMockImplementation()!;
    vi.mocked(h.reader.read).mockImplementation(async (...args) => { if (args[0].type === 'repository') { entered.resolve(); await gate.promise; } return read(...args); });
    h.open(); h.edit(); h.review(); const confirm = button(h.copy.confirm); confirm.click(); confirm.click(); await entered.promise;
    expect(h.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(1); gate.resolve(); await ready(() => !document.querySelector('[data-repository-relocation]'));
});
it.each(['future', 'corrupt'] as const)('unreadable %s preferences cannot be overwritten by verification or cause silent draft deletion', async state => {
    const initial = state === 'future' ? { ...DEFAULT_SETTINGS, schemaVersion: 999 } : { damaged: true }; const h = await mounted('en', initial);
    const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    h.namedPorts.connected.mockImplementation(async () => { await h.app.native.repository.updateObserved(value => value, () => true); return undefined; });
    h.open(); h.edit(); h.review(); button(h.copy.confirm).click(); await ready(() => document.body.textContent?.includes(h.copy.unknown) === true);
    expect(h.service.status().state).not.toBe('connected'); expect(h.app.native.values.get(SETTINGS_KEY)).toEqual(initial);
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect((document.querySelector('#relocation-address') as HTMLInputElement).value).toBe('team/renamed');
});
it('a refreshed vault revision requires another visible address review before it can be confirmed', async () => {
    const h = await mounted(); h.open(); h.edit(); h.review(); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current);
    button('Read current sessions').click(); await ready(() => document.body.textContent?.includes(h.copy.changed) === true);
    const calls = h.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change').length;
    h.review(); expect(h.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(calls);
    button(h.copy.confirm).click(); await ready(() => !document.querySelector('[data-repository-relocation]'));
    expect(h.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ revision: 3 });
});
it('a saved session removed elsewhere makes the review unavailable while keeping the typed recovery draft', async () => {
    const h = await mounted(); h.open(); h.edit(); h.review(); await h.connections.change({ type: 'remove', id: 'session-1' }, 1, h.current);
    button('Read current sessions').click(); await ready(() => document.body.textContent?.includes(h.copy.unavailable) === true);
    expect((document.querySelector('#relocation-address') as HTMLInputElement).value).toBe('team/renamed'); expect(button(h.copy.review).disabled).toBe(true);
    button(h.copy.cancel).click(); flushSync(); expect(document.querySelector('[data-repository-relocation]')).toBeNull();
});
it('closing the center during verification cannot save a late relocated target or clear another editor’s draft', async () => {
    const h = await mounted(); const gate = deferred<void>(); const entered = deferred<void>(); const read = vi.mocked(h.reader.read).getMockImplementation()!;
    const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY));
    vi.mocked(h.reader.read).mockImplementation(async (...args) => { if (args[0].type === 'repository') { entered.resolve(); await gate.promise; } return read(...args); });
    h.open(); h.edit(); h.review(); button(h.copy.confirm).click(); await entered.promise; h.app.stop(); await Promise.resolve(); gate.resolve();
    await vi.waitFor(() => expect(h.service.status().state).not.toBe('connected')); expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before);
});
