// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { clearCenterFixture as fixture, clearText as text } from '../fixtures/clear_center.ts';
import { ready, button } from '../fixtures/center_app_dom.ts';
import { historyButton } from '../fixtures/history_center_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';

it.each(['en', 'es', 'fr', 'pt'])('the actual %s center shows separate clear facts and never records diagnostics deletion itself', async locale => {
    const f = await fixture(locale); await f.begin(); await ready(() => text().includes(f.clear.states.reviewed));
    expect(document.activeElement?.id).toBe('history-review-heading'); expect(text()).not.toContain(f.copy.text.sourceCurrent); await f.confirm();
    for (const label of [f.clear.results['observed-cleared'], f.clear.submitted, f.copy.policyAcks.accepted, f.clear.observations.cleared]) expect(text()).toContain(label);
    expect(f.rows()).toHaveLength(0); expect(f.rows('recents')).toHaveLength(1); expect(text()).toContain(f.operation.retained.untracked);
    expect(f.sessions.reader.read).not.toHaveBeenCalled(); expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled(); expect(text()).not.toContain('operationId');
});
it('a pending clear attempt is visible and metadata refresh cannot resubmit confirmation', async () => {
    const f = await fixture(); await f.begin(); const entered = deferred<void>(); const gate = deferred<void>(); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { if (args[1].type === 'clear') { entered.resolve(); await gate.promise; } return execute(...args); });
    button(f.copy.text.confirm).click(); await entered.promise; await ready(() => text().includes(f.clear.submitted)); expect(text()).toContain(f.copy.policyAcks.unknown);
    button(f.operation.read).click(); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.clear.confirm')).toHaveLength(1); gate.resolve(); await ready(() => text().includes(f.clear.states.settled));
});
it('a pending canonical read keeps accepted acknowledgement visible without claiming an empty generation', async () => {
    const f = await fixture(); await f.begin(); const entered = deferred<void>(); const gate = deferred<void>(); let written = false; const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { if (args[1].type === 'read' && written) { entered.resolve(); await gate.promise; } const value = await execute(...args); if (args[1].type === 'clear') written = true; return value; });
    button(f.copy.text.confirm).click(); await entered.promise; await ready(() => text().includes(f.copy.policyAcks.accepted));
    expect(text()).toContain(f.clear.observations['not-observed']); expect(text()).not.toContain(f.clear.results['observed-cleared']); gate.resolve(); await ready(() => text().includes(f.clear.states.settled));
});
it('a lost native acknowledgement can verify the empty generation without inventing an accepted response', async () => {
    const f = await fixture(); await f.begin(); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { const value = await execute(...args); if (args[1].type === 'clear') throw new Error('private native response'); return value; });
    await f.confirm(); expect(text()).toContain(f.clear.results['observed-cleared']); expect(text()).toContain(f.copy.policyAcks.unknown); expect(text()).not.toContain(f.copy.policyAcks.accepted); expect(text()).not.toContain('private native response');
});
it.each(['not-started', 'aborted'] as const)('the native %s outcome shows no applied write and preserves local history', async effect => {
    const f = await fixture(); await f.begin(); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation((...args) => args[1].type === 'clear' ? Promise.resolve({ state: 'unavailable', effect }) : execute(...args));
    await f.confirm(); expect(text()).toContain(f.copy.policyAcks['not-applied']); expect(text()).toContain(f.copy.reasons[effect]); expect(text()).not.toContain(f.copy.text.sourceCurrent); expect(f.rows()).toHaveLength(1);
});
it('a failed canonical read cannot hide an already accepted clear or present it as a verified empty generation', async () => {
    const f = await fixture(); await f.begin(); let written = false; const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { if (written && args[1].type === 'read') throw new Error('private read'); const value = await execute(...args); if (args[1].type === 'clear') written = true; return value; });
    await f.confirm(); expect(text()).toContain(f.copy.policyAcks.accepted); expect(text()).toContain(f.clear.observations.unavailable); expect(text()).toContain(f.clear.results.unknown); expect(text()).not.toContain(f.clear.results['observed-cleared']);
});
it('a lost primary response leaves native clear facts inspectable without repeating deletion', async () => {
    const f = await fixture(); await f.begin(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => { const value = await send(message); return message.method === 'center.history.clear.confirm' ? null : value; });
    await f.confirm(); expect(document.querySelector('.history-review')?.textContent).toContain(f.copy.text.uncertain); button(f.operation.read).click(); await ready(() => text().includes(f.operation.status.ready));
    expect(text()).toContain(f.clear.observations.cleared); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.clear.confirm')).toHaveLength(1); expect(f.rows()).toHaveLength(0);
});
it('cancelling the unsubmitted review shows no attempt and does not delete any data', async () => {
    const f = await fixture(); await f.begin(); button(f.copy.text.cancel).click(); await ready(() => text().includes(f.clear.states.cancelled));
    expect(text()).toContain(f.clear.notObserved); expect(text()).not.toContain(f.copy.text.sourceCurrent); expect(f.rows()).toHaveLength(1); expect(vi.mocked(f.journals.execute).mock.calls.some(([, command]) => command.type === 'clear')).toBe(false);
});
it('native controller handoff removes current clear context instead of rebuilding it from retained history', async () => {
    const f = await fixture('en', true); await f.begin('recents'); const sender = { ...CENTER_SENDER, documentId: 'another-center', tab: { id: 2, incognito: false } }; const other = await f.open(sender);
    await f.call({ clientId: other.clientId, controllerEpoch: other.controllerEpoch, method: 'center.claim' }, sender); await ready(() => text().includes(f.operation.empty)); expect(document.querySelector('[data-operation-target]')).toBeNull();
});
it('the original five-minute current lifetime expires independently from retained clear history', async () => {
    const f = await fixture('en', true); await f.begin('recents'); await f.confirm(); await f.history.writer.flush(); const at = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(at + 300001);
    button(f.operation.read).click(); await ready(() => text().includes(f.operation.empty)); expect(f.rows().some(row => row.fact.kind === 'clear-operation')).toBe(true);
});
it('retained clear history uses semantic nested headings without private targets or mutation controls', async () => {
    const f = await fixture('en', true); await f.begin('recents'); await f.confirm(); await f.history.writer.flush(); button(f.copy.text.close).click(); await ready(() => !document.querySelector('.history-review'));
    const count = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length; historyButton('diagnostics', f.copy.text.read).click();
    await ready(() => f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length > count && document.querySelector('[data-history=diagnostics]')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('[data-history-entry] [data-clear-effects]'));
    const row = document.querySelector('[data-history-entry]:has([data-clear-effects])')!; expect(row.querySelector('h3')?.textContent).toContain(f.clear.action); expect(row.querySelector('h4')?.textContent).toBe(f.clear.submission); expect(row.querySelector('button')).toBeNull(); expect(row.querySelector('[data-operation-target]')).toBeNull();
});
it('current-only refresh leaves history reads, provider calls and permission observations unchanged', async () => {
    const f = await fixture(); await f.begin(); await f.confirm(); const count = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length; const permissions = vi.mocked(f.app.browser.api.permissions.contains).mock.calls.length;
    button(f.operation.read).click(); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false'); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read')).toHaveLength(count); expect(f.app.browser.api.permissions.contains).toHaveBeenCalledTimes(permissions); expect(f.sessions.reader.read).not.toHaveBeenCalled();
});
it('failed secondary metadata preserves earlier clear facts but retires its private destination', async () => {
    const f = await fixture(); await f.begin(); await f.confirm(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(message => message.method === 'center.operation.read' ? Promise.resolve(null) : send(message)); button(f.operation.read).click(); await ready(() => text().includes(f.operation.status.unavailable)); expect(text()).toContain(f.clear.observations.cleared); expect(document.querySelector('[data-operation-target]')).toBeNull(); expect(f.rows()).toHaveLength(0);
});
it('disposing the actual center prevents a delayed metadata read from republishing clear context', async () => {
    const f = await fixture(); await f.begin(); await f.confirm(); const send = f.app.port.send.getMockImplementation()!; const gate = deferred<void>(); const entered = deferred<void>();
    f.app.port.send.mockImplementation(async message => { const value = await send(message); if (message.method === 'center.operation.read') { entered.resolve(); await gate.promise; } return value; });
    button(f.operation.read).click(); await entered.promise; f.app.stop(); gate.resolve(); await tick(); expect(document.body.textContent).toBe('');
});
