// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { compoundCenterFixture as fixture, compoundText as text } from '../fixtures/compound_center.ts';
import { ready, button } from '../fixtures/center_app_dom.ts';
import { historyButton } from '../fixtures/history_center_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';

it.each(['en', 'es', 'fr', 'pt'])('the actual %s center shows all independent collection effects with no retrospective history capture', async locale => {
    const f = await fixture(locale); await f.begin(); await ready(() => text().includes(f.compound.states.reviewed));
    expect(text()).not.toContain(f.copy.text.sourceCurrent); await f.confirm();
    for (const label of [f.compound.pause, f.compound.activation, f.copy.text.phasePreference, f.copy.text.verified]) expect(text()).toContain(label);
    expect(text()).toContain(f.operation.retained.untracked); expect(f.rows()).toHaveLength(0); expect(document.body.textContent).not.toContain('operationId');
    expect(f.sessions.reader.read).not.toHaveBeenCalled(); expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('pending preference persistence is visible and metadata refresh cannot resubmit the actual confirmation', async () => {
    const f = await fixture(); await f.begin(); const entered = deferred<void>(); const gate = deferred<void>(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; await set(...args); });
    button(f.copy.text.confirm).click(); await entered.promise; await ready(() => text().includes(f.compound.preferencePhases.submitted));
    button(f.operation.read).click(); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.collection.confirm')).toHaveLength(1); expect(f.port.set).toHaveBeenCalledOnce();
    gate.resolve(); await ready(() => text().includes(f.compound.states.settled));
});
it('pending native activation remains an attempted policy command independently from the already verified preference', async () => {
    const f = await fixture(); await f.begin(); const gate = deferred<void>(); const entered = deferred<void>(); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => { if (args[1].type === 'set' && args[1].mode === 'active') { entered.resolve(); await gate.promise; } return execute(...args); });
    button(f.copy.text.confirm).click(); await entered.promise; await ready(() => text().includes(f.compound.policyPhases.submitted));
    expect(text()).toContain(f.copy.observations.committed); expect(text()).toContain(f.copy.policyAcks.unknown); gate.resolve(); await ready(() => text().includes(f.compound.states.settled));
});
it('a returned stop result does not hide a failed durable pause when its off preference was saved', async () => {
    const f = await fixture('en', true); await f.begin('stop'); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => args[1].type === 'set' ? { state: 'unavailable', effect: 'unknown' } : execute(...args));
    await f.confirm(); expect(text()).toContain(f.copy.observations.committed); expect(text()).toContain(f.copy.text.active); expect(text()).toContain(f.copy.policyAcks.unknown);
    expect(text()).toContain(f.compound.notApplicable); expect(text()).toContain(f.copy.reasons.done); expect(f.port.set).toHaveBeenCalledOnce();
});
it('stopping an already-off preference shows that no preference write was required while preserving the actual durable pause', async () => {
    const f = await fixture(); f.policiesData.set('diagnostics', activeCollectionPolicy()); await f.history.refresh(); await f.begin('stop'); await f.confirm();
    expect(text()).toContain(f.compound.notRequired); expect(text()).toContain(f.copy.text.paused); expect(f.port.set).not.toHaveBeenCalled();
});
it('a failed off preference preserves the separately verified durable pause and its unconfirmed service reason', async () => {
    const f = await fixture('en', true); await f.begin('stop'); vi.mocked(f.port.set).mockResolvedValueOnce(undefined); await f.confirm();
    expect(text()).toContain(f.copy.reasons['preference-unconfirmed']); expect(text()).toContain(f.copy.observations.unchanged); expect(text()).toContain(f.copy.text.paused);
    expect(f.port.set).toHaveBeenCalledOnce(); expect(vi.mocked(f.policies.execute).mock.calls.filter(([, command]) => command.type === 'set')).toHaveLength(1);
});
it('a lost primary response leaves current native facts inspectable without repeating collection activation', async () => {
    const f = await fixture(); await f.begin(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => { const value = await send(message); return message.method === 'center.collection.confirm' ? null : value; });
    await f.confirm(); expect(document.querySelector('.history-review')?.textContent).toContain(f.copy.text.uncertain);
    button(f.operation.read).click(); await ready(() => text().includes(f.operation.status.ready));
    expect(text()).toContain(f.copy.observations.committed); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.collection.confirm')).toHaveLength(1); expect(f.port.set).toHaveBeenCalledOnce();
});
it('cancelling an unconfirmed review displays no attempted effect and performs no policy or preference mutation', async () => {
    const f = await fixture(); await f.begin(); button(f.copy.text.cancel).click(); await ready(() => text().includes(f.compound.states.cancelled));
    expect(f.port.set).not.toHaveBeenCalled(); expect(vi.mocked(f.policies.execute).mock.calls.some(([, command]) => command.type === 'set')).toBe(false); expect(f.rows()).toHaveLength(0);
});
it('failed secondary metadata preserves earlier proved collection effects and retires its target without stopping capture', async () => {
    const f = await fixture(); await f.begin(); await f.confirm(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => message.method === 'center.operation.read' ? null : send(message)); button(f.operation.read).click();
    await ready(() => text().includes(f.operation.status.unavailable)); expect(text()).toContain(f.copy.observations.committed); expect(document.querySelector('[data-operation-target]')).toBeNull();
    expect(f.history.coordinator.state('diagnostics').collecting).toBe(true);
});
it('a different native controller cannot reconstruct the old current collection target from its retained row', async () => {
    const f = await fixture('en', true); await f.begin('stop'); const sender = { ...CENTER_SENDER, documentId: 'another-center', tab: { id: 2, incognito: false } }; const other = await f.open(sender);
    await f.call({ clientId: other.clientId, controllerEpoch: other.controllerEpoch, method: 'center.claim' }, sender);
    await ready(() => text().includes(f.operation.empty)); expect(document.querySelector('[data-operation-target]')).toBeNull();
});
it('the original five-minute lifetime expires independently from retained compound history', async () => {
    const f = await fixture('en', true); await f.begin('stop'); await f.confirm(); await f.history.writer.flush();
    const at = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(at + 300001); button(f.operation.read).click(); await ready(() => text().includes(f.operation.empty));
    expect(f.rows().some(row => row.fact.kind === 'collection-operation')).toBe(true);
});
it('actual retained compound history renders independent effects with nested headings and no target or mutation controls', async () => {
    const f = await fixture('en', true); await f.begin('stop'); await f.confirm(); await f.history.writer.flush(); button(f.copy.text.close).click();
    await ready(() => !document.querySelector('.history-review') && !historyButton('diagnostics', f.copy.text.read).disabled, 'retained history read is enabled after secondary persistence');
    const reads = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length;
    historyButton('diagnostics', f.copy.text.read).click(); await ready(() => f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length > reads
        && document.querySelector('[data-history=diagnostics]')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('[data-history-entry] [data-collection-effects]'), 'explicit history read observes the independently retained effects');
    const row = document.querySelector('[data-history-entry]')!; expect(row.querySelector('h3')?.textContent).toContain(f.compound.actions.stop);
    expect(row.querySelector('h4')?.textContent).toBe(f.copy.text.phasePreference); expect(row.querySelector('button')).toBeNull(); expect(row.querySelector('[data-operation-target]')).toBeNull();
});
it('operation-only refresh leaves permission observations, history reads and provider calls unchanged', async () => {
    const f = await fixture(); await f.begin(); await f.confirm(); await ready(() => text().includes(f.operation.status.ready));
    const reads = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length; const permissions = vi.mocked(f.app.browser.api.permissions.contains).mock.calls.length;
    button(f.operation.read).click(); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read')).toHaveLength(reads); expect(f.app.browser.api.permissions.contains).toHaveBeenCalledTimes(permissions); expect(f.sessions.reader.read).not.toHaveBeenCalled();
});
it('disposing the actual center prevents a delayed metadata response from republishing collection context', async () => {
    const f = await fixture(); await f.begin(); await f.confirm(); const send = f.app.port.send.getMockImplementation()!; const gate = deferred<void>(); const entered = deferred<void>();
    f.app.port.send.mockImplementation(async message => { const value = await send(message); if (message.method === 'center.operation.read') { entered.resolve(); await gate.promise; } return value; });
    button(f.operation.read).click(); await entered.promise; f.app.stop(); gate.resolve(); await tick(); expect(document.body.textContent).toBe('');
});
