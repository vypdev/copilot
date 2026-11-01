// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { purposeCenterFixture as fixture } from '../fixtures/purpose_center.ts';
import { button, ready } from '../fixtures/center_app_dom.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/native_session_vault.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { deferred } from '../fixtures/runtime.ts';

it.each(['issues-write', 'actions-write'] as const)('the actual %s page journey clears the native password before permission resolves and saves only its separate purpose', async purpose => {
    const h = await fixture(); const active = structuredClone(h.sessionValues.get(SESSION_KEY)); const saved = structuredClone(h.localValues.get(SETTINGS_KEY));
    const permission = deferred<boolean>(); vi.mocked(h.app.browser.api.permissions.request).mockReturnValueOnce(permission.promise); h.fill(purpose);
    const requests = h.app.port.send.mock.calls.length; button(h.common.connect).click(); flushSync();
    expect((document.getElementById('connection-secret') as HTMLInputElement).value).toBe(''); expect(h.app.port.send).toHaveBeenCalledTimes(requests); expect(h.provider).not.toHaveBeenCalled();
    expect(h.app.browser.api.permissions.request).toHaveBeenCalledWith({ origins: ['https://api.github.com/*'] }); permission.resolve(true);
    await ready(() => !!h.vault()?.entries.some(entry => entry.role === purpose) && !button(h.common.connect).matches(':disabled'));
    expect(h.vault()).toMatchObject({ schemaVersion: 2, writeSelections: { 'issues-write': null, 'actions-write': null } }); expect(h.writes()).toHaveLength(1);
    expect(h.sessionValues.get(SESSION_KEY)).toEqual(active); expect(h.localValues.get(SETTINGS_KEY)).toEqual(saved); expect(h.localArea.set).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true); expect(document.body.textContent).toContain(h.copy.availability);
});
it('a standalone options page can save an optional identity without ever creating or restoring an active read credential', async () => {
    const h = await fixture(false); await h.add(); expect(h.sessionValues.has(SESSION_KEY)).toBe(false); expect(h.vault()?.selected).toBeNull(); expect(h.writes()).toHaveLength(1);
});
it.each(['es', 'fr', 'pt'] as const)('the complete %s optional-purpose journey verifies, saves, reviews and disables the same identity through the actual page and background', async locale => {
    const h = await fixture(true, locale); await h.add(); expect(document.body.textContent).toContain(h.copy.availability);
    await ready(() => !(document.getElementById(`connection-select-${h.id('issues-write')}`) as HTMLButtonElement).disabled, 'optional identity review is enabled'); h.review();
    await ready(() => document.activeElement?.id === 'connection-role-review-heading' && !button(h.copy.confirm).disabled, 'optional identity review is focused and ready');
    expect(h.reviewText()).toContain(h.copy.title); button(h.copy.confirm).click();
    await ready(() => h.reviewText().includes(h.copy.saved) && !button(h.copy.close).disabled, 'saved optional selection is ready to close');
    expect(h.reviewText()).toContain(h.copy.grant); button(h.copy.close).click();
    await ready(() => document.activeElement?.id === `connection-select-${h.id('issues-write')}` && !button(h.copy.disable).disabled, 'selection focus returned and optional disable is enabled'); button(h.copy.disable).click();
    await ready(() => { const vault = h.vault(); return vault?.schemaVersion === 2 && vault.writeSelections['issues-write'] === null && h.writes().length === 3; }, 'optional selection is disabled in the native vault');
    expect(h.vault()!.entries).toHaveLength(2); expect(h.provider).toHaveBeenCalledTimes(4); expect(h.localArea.set).not.toHaveBeenCalled();
});
it('denied permission retains the nonsecret purpose/name draft while clearing its password and issuing no native change', async () => {
    const h = await fixture(); vi.mocked(h.app.browser.api.permissions.request).mockResolvedValueOnce(false); h.fill(); button(h.common.connect).click();
    await ready(() => document.body.textContent?.includes(h.common.outcomes.denied) === true);
    expect((document.getElementById('connection-secret') as HTMLInputElement).value).toBe(''); expect((document.getElementById('connection-purpose') as HTMLSelectElement).value).toBe('issues-write');
    expect((document.getElementById('connection-name') as HTMLInputElement).value).toBe('Optional account'); expect(h.provider).not.toHaveBeenCalled(); expect(h.writes()).toHaveLength(0);
});
it.each(['synchronous', 'asynchronous'] as const)('a %s permission failure clears the submitted credential without displaying private native errors', async kind => {
    const h = await fixture(); if (kind === 'synchronous') vi.mocked(h.app.browser.api.permissions.request).mockImplementationOnce(() => { throw new Error('private native failure'); });
    else vi.mocked(h.app.browser.api.permissions.request).mockRejectedValueOnce(new Error('private native failure'));
    h.fill(); button(h.common.connect).click(); await ready(() => document.body.textContent?.includes(h.common.outcomes.unavailable) === true);
    expect((document.getElementById('connection-secret') as HTMLInputElement).value).toBe(''); expect(document.body.textContent).not.toContain('private native failure'); expect(h.writes()).toHaveLength(0);
});
it.each(['missing', 'unknown'] as const)('a %s native purpose field cannot silently route an optional credential through the old read connection', async kind => {
    const h = await fixture(); const active = structuredClone(h.sessionValues.get(SESSION_KEY)); h.fill(); const purpose = document.getElementById('connection-purpose') as HTMLSelectElement;
    if (kind === 'missing') purpose.remove(); else purpose.value = 'unsupported'; document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await ready(() => document.body.textContent?.includes(h.common.outcomes.invalid) === true); expect(h.provider).not.toHaveBeenCalled(); expect(h.writes()).toHaveLength(0);
    expect(h.sessionValues.get(SESSION_KEY)).toEqual(active); expect((document.getElementById('connection-secret') as HTMLInputElement).value).toBe('');
});
it('an explicit row review focuses its heading and selects only the reviewed purpose after fresh native identity reads', async () => {
    const h = await fixture(); await h.add(); const active = structuredClone(h.sessionValues.get(SESSION_KEY)); h.provider.mockClear(); h.review();
    await ready(() => document.activeElement?.id === 'connection-role-review-heading'); expect(h.provider).not.toHaveBeenCalled(); button(h.copy.confirm).click();
    await ready(() => h.reviewText().includes(h.copy.saved)); expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.vault()).toMatchObject({ writeSelections: { 'issues-write': h.id('issues-write'), 'actions-write': null } }); expect(h.sessionValues.get(SESSION_KEY)).toEqual(active);
    expect(h.reviewText()).toContain(h.copy.grant); button(h.copy.close).click(); await ready(() => document.activeElement?.id === `connection-select-${h.id('issues-write')}`);
});
it('cancelling a real row review leaves native selections unchanged and returns keyboard focus without provider access', async () => {
    const h = await fixture(); await h.add(); const saved = structuredClone(h.vault()); h.provider.mockClear(); const writes = h.writes().length; h.review();
    await ready(() => !!document.querySelector('[data-role-review]')); button(h.copy.cancel).click(); await ready(() => document.activeElement?.id === `connection-select-${h.id('issues-write')}`);
    expect(h.vault()).toEqual(saved); expect(h.writes()).toHaveLength(writes); expect(h.provider).not.toHaveBeenCalled();
});
it('a real native vault revision event retires the old review without rebasing its identity or confirming anything', async () => {
    const h = await fixture(); await h.add(); h.review(); await ready(() => !!document.querySelector('[data-role-review]')); h.provider.mockClear();
    h.sessionValues.set(NAMED_SESSIONS_KEY, { ...h.vault()!, revision: 8 }); for (const listener of h.changed.listeners) listener({ [NAMED_SESSIONS_KEY]: {} }, 'session');
    await ready(() => h.reviewText().includes(h.copy.changed)); expect(button(h.copy.confirm).disabled).toBe(true); expect(h.reviewText()).not.toContain('octo/example'); expect(h.provider).not.toHaveBeenCalled();
});
it('lost native response preserves unknown outcome even after reading the actual selected identity, without repeating selection', async () => {
    const h = await fixture(); await h.add(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async value => { const response = await send(value); return value.method === 'center.connections.change' && value.intent.type === 'select' ? null : response; });
    h.review(); await ready(() => !!document.querySelector('[data-role-review]')); button(h.copy.confirm).click(); await ready(() => h.reviewText().includes(h.copy.unknown));
    const calls = () => h.app.port.send.mock.calls.filter(([value]) => value.method === 'center.connections.change' && value.intent.type === 'select');
    expect(calls()).toHaveLength(1); button(h.copy.refresh).click(); await ready(() => !button(h.copy.refresh).disabled);
    expect(h.reviewText()).toContain(h.copy.unknown); expect(calls()).toHaveLength(1); expect(h.vault()).toMatchObject({ writeSelections: { 'issues-write': h.id('issues-write') } });
});
it('leaving an unknown selection explains retained native effects and cannot undo or repeat the original request', async () => {
    const h = await fixture(); await h.add(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async value => { const response = await send(value); return value.method === 'center.connections.change' && value.intent.type === 'select' ? null : response; });
    h.review(); await ready(() => !!document.querySelector('[data-role-review]')); button(h.copy.confirm).click(); await ready(() => h.reviewText().includes(h.copy.unknown));
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('section[aria-label] [role=alert]') || !!document.querySelector('section[role=alert]'));
    expect(document.querySelector('section[role=alert]')?.textContent).toContain(h.copy.navigation); button(h.center.messages.discard).click(); await ready(() => !!document.getElementById('center-theme'));
    expect(h.app.port.send.mock.calls.filter(([value]) => value.method === 'center.connections.change' && value.intent.type === 'select')).toHaveLength(1);
    expect(h.vault()).toMatchObject({ writeSelections: { 'issues-write': h.id('issues-write') } });
});
it('closing the options page during its permission prompt prevents a late optional credential from reaching the background', async () => {
    const h = await fixture(); const permission = deferred<boolean>(); vi.mocked(h.app.browser.api.permissions.request).mockReturnValueOnce(permission.promise); h.fill(); button(h.common.connect).click(); h.app.stop(); permission.resolve(true);
    await vi.waitFor(() => expect(h.app.port.send.mock.calls.at(-1)?.[0].method).toBe('center.close')); expect(h.writes()).toHaveLength(0); expect(h.provider).not.toHaveBeenCalled();
});
it('the purpose captured before permission waiting cannot be changed into another role by a later DOM mutation', async () => {
    const h = await fixture(); const permission = deferred<boolean>(); vi.mocked(h.app.browser.api.permissions.request).mockReturnValueOnce(permission.promise); h.fill(); button(h.common.connect).click();
    (document.getElementById('connection-purpose') as HTMLSelectElement).value = 'repository-read'; permission.resolve(true);
    await ready(() => !!h.vault()?.entries.some(entry => entry.role === 'issues-write')); expect(h.vault()?.entries.filter(entry => entry.role === 'repository-read')).toHaveLength(1);
});
it.each(['future', 'corrupt'] as const)('a %s saved settings record does not prevent real optional role management or cause an invented default settings write', async state => {
    const initial = state === 'future' ? { ...DEFAULT_SETTINGS, schemaVersion: 99 } : { broken: true }; const h = await fixture(true, 'en', initial); const saved = structuredClone(h.localValues.get(SETTINGS_KEY));
    await h.add(); expect(h.localValues.get(SETTINGS_KEY)).toEqual(saved); expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.vault()).toMatchObject({ schemaVersion: 2 });
});
it('browser permission revocation cancels actual optional verification and removes every protected purpose before a late provider reply', async () => {
    const h = await fixture(); await h.add(); h.review(); await ready(() => !!document.querySelector('[data-role-review]'));
    const entered = deferred<void>(); const reply = deferred<Response>(); let requested = '';
    h.provider.mockImplementationOnce(async url => { requested = url; entered.resolve(); return reply.promise; }); button(h.copy.confirm).click(); await entered.promise;
    const signal = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.signal;
    for (const listener of h.permissionRemoved.listeners) listener({ origins: ['https://api.github.com/*'] });
    expect(signal?.aborted).toBe(true); await vi.waitFor(() => { expect(h.sessionValues.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.sessionValues.has(SESSION_KEY)).toBe(false); });
    const response = new Response(JSON.stringify({ id: 1, login: 'octo' }), { headers: { 'content-type': 'application/json' } }); Object.defineProperty(response, 'url', { value: requested }); reply.resolve(response);
    await ready(() => h.reviewText().includes(h.copy.unknown)); expect(h.sessionValues.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.sessionValues.has(SESSION_KEY)).toBe(false);
});
it('closing a native page during provider verification prevents late selection persistence and cannot revive its retired DOM review', async () => {
    const h = await fixture(); await h.add(); h.review(); await ready(() => !!document.querySelector('[data-role-review]'));
    const entered = deferred<void>(); const reply = deferred<Response>(); let requested = '';
    h.provider.mockImplementationOnce(async url => { requested = url; entered.resolve(); return reply.promise; }); const before = structuredClone(h.vault());
    button(h.copy.confirm).click(); await entered.promise; h.app.stop(); await vi.waitFor(() => expect(h.app.port.send.mock.calls.at(-1)?.[0].method).toBe('center.close'));
    const response = new Response(JSON.stringify({ id: 1, login: 'octo' }), { headers: { 'content-type': 'application/json' } }); Object.defineProperty(response, 'url', { value: requested }); reply.resolve(response);
    await vi.waitFor(() => expect(document.querySelector('[data-role-review]')).toBeNull()); expect(h.vault()).toEqual(before);
});
