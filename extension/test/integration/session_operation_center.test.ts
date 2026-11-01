// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick, flushSync } from 'svelte';
import { sessionCenterFixture as fixture, sessionOperationText as text } from '../fixtures/session_center.ts';
import { ready, button, navigate } from '../fixtures/center_app_dom.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { deferred } from '../fixtures/runtime.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';

it.each(['en', 'es', 'fr', 'pt'] as const)('the actual %s connection form exposes all independent session effects with optional history off', async locale => {
    const f = await fixture(locale); await f.connect(); expect(document.querySelectorAll('[data-current-operation] [data-session-effects] li')).toHaveLength(5);
    for (const effect of ['retire-active', 'save-active', 'save-repository-preference', 'save-vault'] as const) expect(text()).toContain(f.session.effects[effect]);
    expect(text()).toContain(f.session.observations.committed); expect(text()).toContain(f.op.retained.untracked); expect(document.body.textContent).not.toContain(CONNECTION_INPUT.secret); expect(f.rows()).toHaveLength(0);
});
it('a pending vault attempt is visible independently of the primary confirmation and cannot be retried by metadata inspection', async () => {
    const f = await fixture(); const entered = deferred<void>(); const gate = deferred<void>(); const set = f.protectedPort.set.getMockImplementation()!;
    f.protectedPort.set.mockImplementation(async (key, value) => { if (key === NAMED_SESSIONS_KEY) { entered.resolve(); await gate.promise; } await set(key, value); });
    f.fill(); button(f.copy.connect).click(); await entered.promise; await ready(() => text().includes(f.session.effectStates.submitted));
    button(f.op.read).click(); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(1); gate.resolve(); await ready(() => text().includes(f.session.results.ready));
});
it('a nonpersisted repository preference reports its own failed phase and candidate cleanup without a vault-save claim', async () => {
    const f = await fixture(); f.settingsPort.set.mockResolvedValueOnce(undefined); f.fill(); button(f.copy.connect).click();
    await ready(() => text().includes(f.session.results.unavailable)); expect(text()).toContain(f.session.effects['save-repository-preference']); expect(text()).toContain(f.session.observations.different);
    expect(text()).toContain(f.session.effects['cleanup-active']); expect(text()).not.toContain(f.session.effects['save-vault']);
});
it('a nonpersisted vault preserves earlier verified effects and presents partial storage explicitly', async () => {
    const f = await fixture(); const set = f.protectedPort.set.getMockImplementation()!;
    f.protectedPort.set.mockImplementation(async (key, value) => { if (key !== NAMED_SESSIONS_KEY) await set(key, value); }); f.fill(); button(f.copy.connect).click();
    await ready(() => text().includes(f.session.results.unknown)); expect(text()).toContain(f.session.observations.committed); expect(text()).toContain(f.session.observations.different); expect(text()).toContain(f.session.effects['cleanup-active']);
});
it('a lost mutation response can be inspected from native operation facts without another connection request', async () => {
    const f = await fixture(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => { const value = await send(message); if (message.method === 'center.connections.change') throw new Error('private transport'); return value; });
    f.fill(); button(f.copy.connect).click(); await ready(() => text().includes(f.session.results.ready));
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(1); expect(f.sessions.service.status().state).toBe('connected');
});
it('current target labels are captured as inert text and excluded from actual retained session history', async () => {
    const f = await fixture('en', true); await f.connect('<img src=x>'); expect(document.querySelector('[data-operation-target]')?.textContent).toBe('<img src=x>'); expect(document.querySelector('img')).toBeNull();
    await f.history.writer.flush(); expect(JSON.stringify(f.rows())).not.toContain('img'); expect(JSON.stringify(f.rows())).not.toContain(CONNECTION_INPUT.secret);
    window.dispatchEvent(new Event('blur')); await tick(); expect(document.querySelector('[data-operation-target]')).toBeNull();
});
it('failed secondary metadata inspection preserves proved session effects and leaves the primary connection available', async () => {
    const f = await fixture(); await f.connect(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => message.method === 'center.operation.read' ? null : send(message)); button(f.op.read).click();
    await ready(() => text().includes(f.op.status.unavailable)); expect(text()).toContain(f.session.effects['save-vault']); expect(document.querySelector('[data-operation-target]')).toBeNull(); expect(f.sessions.service.status().state).toBe('connected');
});
it('a different native controller removes the old target without reconstructing it from the visible sessions list', async () => {
    const f = await fixture(); await f.connect(); const sender = { ...CENTER_SENDER, documentId: 'new-controller', tab: { id: 2, incognito: false } }; const other = await f.open(sender);
    await f.call({ clientId: other.clientId, controllerEpoch: other.controllerEpoch, method: 'center.claim' }, sender); await ready(() => text().includes(f.op.empty)); expect(document.querySelector('[data-operation-target]')).toBeNull();
});
it('the five-minute current-operation lifetime is not renewed by reads and does not erase retained session history', async () => {
    const f = await fixture('en', true); await f.connect(); await f.history.writer.flush(); const at = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(at + 300001);
    button(f.op.read).click(); await ready(() => text().includes(f.op.empty)); expect(f.rows().some(row => row.fact.kind === 'session-operation')).toBe(true);
});
it('session operation metadata remains inspectable when current local preferences become unreadable', async () => {
    const f = await fixture(); await f.connect(); f.values.set(SETTINGS_KEY, { schemaVersion: 99 }); button(f.center.messages.refresh).click();
    await ready(() => document.querySelector('main .revision') === null); const reads = f.settingsPort.get.mock.calls.length; button(f.op.read).click();
    await ready(() => text().includes(f.op.status.ready)); expect(text()).toContain(f.session.effects['save-vault']); expect(f.settingsPort.get).toHaveBeenCalledTimes(reads);
});
it('operation-only refresh does not inspect the provider, reread history or reset the three permission observations', async () => {
    const f = await fixture(); await f.connect(); await navigate('privacy'); await ready(() => !!document.querySelector('[data-permission-status]'));
    // Both serial initial collection reads must settle before measuring an independent operation-only refresh.
    await ready(() => ['diagnostics', 'recents'].every(kind => document.querySelector(`[data-history="${kind}"] [data-history-consent]`) !== null));
    const provider = vi.mocked(f.sessions.reader.read).mock.calls.length; const history = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length;
    await f.bridge({ version: 1, method: 'center.operation.invalidated' }); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    expect(f.sessions.reader.read).toHaveBeenCalledTimes(provider); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read')).toHaveLength(history); expect(f.app.browser.api.permissions.contains).toHaveBeenCalledTimes(3);
});
it('disposing the actual page prevents a delayed native metadata response from restoring any private target', async () => {
    const f = await fixture(); await f.connect(); const entered = deferred<void>(); const gate = deferred<void>(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => { const value = await send(message); if (message.method === 'center.operation.read') { entered.resolve(); await gate.promise; } return value; });
    button(f.op.read).click(); await entered.promise; f.app.stop(); gate.resolve(); await tick(); expect(document.body.textContent).toBe('');
});
it('canceling an unsubmitted removal dialog cannot fabricate a native removal or another history operation', async () => {
    const f = await fixture(); await f.connect(); const mutations = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change').length;
    button(f.copy.remove).click(); flushSync(); button(f.copy.cancel).click(); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.connections.change')).toHaveLength(mutations); expect(text()).toContain(f.session.actions.connect);
});
it('a proved successful connection clears its submitted draft despite the operation’s own native invalidations', async () => {
    const f = await fixture(); await f.connect(); expect((document.querySelector('#connection-name') as HTMLInputElement).value).toBe('');
    await navigate('privacy'); await ready(() => !!document.querySelector('[data-permission-status]')); expect(document.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
});
