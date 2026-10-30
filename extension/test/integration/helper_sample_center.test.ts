// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { helperCenterFixture as fixture, helperText as text } from '../fixtures/helper_center.ts';
import { ready, button, navigate } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';

it.each(['en', 'es', 'fr', 'pt'])('the actual %s options center renders a bounded historical sample independently from optional retention', async locale => {
    const f = await fixture(locale); expect(text()).toContain(f.copy.boundary); expect(text()).toContain(f.copy.helpers['runtime-health']); expect(text()).toContain(f.copy.codes['mount-failed']);
    expect(text()).toContain(f.copy.scopes['retired-at-observation']); expect(text()).toContain(operationCopy(locale).retained.untracked);
    expect(document.querySelector('[data-helper-sample] h2')?.textContent).toBe(f.copy.title); expect(document.querySelectorAll('[data-helper-sample] h3')).toHaveLength(3);
    expect(document.querySelectorAll('[data-helper-sample] time')).toHaveLength(1); expect(f.rows()).toHaveLength(0); expect(text()).not.toMatch(/sourceTree|generation|credentialEpoch|settingsRevision|private_helper_/);
    expect(f.sessions.reader.read).not.toHaveBeenCalled(); expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('the complete captured ring remains visible while diagnostics retains only one latest reason per helper', async () => {
    const f = await fixture('en', true); await f.history.writer.flush(); await f.read(); expect(document.querySelectorAll('[data-helper-sample] ol li')).toHaveLength(3);
    expect(f.rows()).toHaveLength(2); expect(f.rows().map(row => row.fact)).toEqual([{ kind: 'helper', helper: 'runtime-health', code: 'cleanup-failed', scope: 'retired-at-observation' }, { kind: 'helper', helper: 'center-shortcuts', code: 'refresh-failed', scope: 'retired-at-observation' }]);
    expect(text()).toContain(operationCopy('en').retained.stored);
});
it.each(['empty', 'unavailable', 'none'] as const)('the %s capture state cannot be confused with the other source observations', async state => {
    const f = await fixture('en', false, state); expect(text()).toContain(state === 'empty' ? f.copy.noneReasons : state === 'none' ? f.copy.empty : f.copy.unavailable);
    if (state !== 'empty') expect(text()).not.toContain(f.copy.noneReasons); expect(f.rows()).toHaveLength(0);
});
it('pending metadata has a polite status and a disabled refresh control without another request on a repeated click', async () => {
    const f = await fixture(); const send = f.app.port.send.getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    f.app.port.send.mockImplementation(async message => { const value = await send(message); if (message.method === 'center.health.read') { entered.resolve(); await gate.promise; } return value; });
    const before = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read').length; button(f.copy.read).click(); await entered.promise;
    await ready(() => text().includes(f.copy.phases.reading)); expect(button(f.copy.read).disabled).toBe(true); button(f.copy.read).click();
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read')).toHaveLength(before + 1); gate.resolve(); await ready(() => text().includes(f.copy.phases.ready));
});
it('source-sample refresh performs no history, settings, provider or permission request and never reopens a native tab', async () => {
    const f = await fixture(); await f.history.writer.flush(); const messages = f.app.port.send.mock.calls.filter(([m]) => m.method !== 'center.health.read').length;
    const storage = vi.mocked(f.port.get).mock.calls.length; const journals = vi.mocked(f.journals.execute).mock.calls.length; const permissions = vi.mocked(f.app.browser.api.permissions.contains).mock.calls.length;
    await f.read(); expect(f.app.port.send.mock.calls.filter(([m]) => m.method !== 'center.health.read')).toHaveLength(messages); expect(f.port.get).toHaveBeenCalledTimes(storage); expect(f.journals.execute).toHaveBeenCalledTimes(journals);
    expect(f.app.browser.api.permissions.contains).toHaveBeenCalledTimes(permissions); expect(f.sessions.reader.read).not.toHaveBeenCalled();
});
it('a failed metadata response exposes unknown helper health without repeating capture or leaking the provider error', async () => {
    const f = await fixture(); const send = f.app.port.send.getMockImplementation()!; f.app.port.send.mockImplementation(message => message.method === 'center.health.read' ? Promise.reject(new Error('private origin')) : send(message));
    button(f.copy.read).click(); await ready(() => text().includes(f.copy.phases.unavailable)); expect(text()).not.toContain('private origin'); expect(text()).not.toContain(f.copy.noneReasons);
});
it('the five-minute native sample lifetime expires without removing optional retained diagnostics', async () => {
    const f = await fixture('en', true); await f.history.writer.flush(); const at = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(at + 300001); await f.read();
    expect(text()).toContain(f.copy.empty); expect(document.querySelector('[data-helper-sample] time')).toBeNull(); expect(f.rows()).toHaveLength(2);
});
it('Help exposes the same read-only source observation and other routes do not expose its component', async () => {
    const f = await fixture(); await navigate('help'); await ready(() => text().includes(f.copy.phases.ready)); expect(text()).toContain(f.copy.codes['cleanup-failed']);
    expect([...document.querySelectorAll('[data-helper-sample] button')].map(node => node.textContent)).toEqual([f.copy.read]); await navigate('appearance'); expect(document.querySelector('[data-helper-sample]')).toBeNull();
});
it('unavailable preferences cannot disable the separately admitted source-sample inspection', async () => {
    const f = await fixture(); f.values.set(SETTINGS_KEY, { schemaVersion: 99 }); await f.bridge({ version: 1, method: 'center.invalidated' });
    await ready(() => !document.querySelector('main .revision')); await f.read(); expect(text()).toContain(f.copy.codes['mount-failed']); expect(button(f.copy.read).disabled).toBe(false);
});
it('a native sample install arriving after an earlier empty read schedules a fresh metadata observation', async () => {
    const f = await fixture('en', false, 'none'); const intent = { state: 'unavailable', sourceTree: f.sourceTree }; const receipt = f.helpers.capture(intent, null)!;
    f.helpers.attach(receipt, 2); await ready(() => text().includes(f.copy.unavailable)); expect(text()).not.toContain(f.copy.empty);
});
it('disposing the actual center prevents an in-flight sample response from republishing any origin context', async () => {
    const f = await fixture(); const send = f.app.port.send.getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    f.app.port.send.mockImplementation(async message => { const value = await send(message); if (message.method === 'center.health.read') { entered.resolve(); await gate.promise; } return value; });
    button(f.copy.read).click(); await entered.promise; f.app.stop(); gate.resolve(); await tick(); expect(document.body.textContent).toBe('');
});
it('a mixed source build retires sample inspection and disables refresh until native compatibility is restored', async () => {
    const f = await fixture(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(message => message.method === 'center.health.read' ? Promise.resolve({ sourceTree: 'foreign' }) : send(message));
    button(f.copy.read).click(); await ready(() => button(f.copy.read).disabled); const count = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read').length;
    button(f.copy.read).click(); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.health.read')).toHaveLength(count); expect(document.querySelector('[data-helper-sample] time')).toBeNull();
});
it.each(['en', 'es', 'fr', 'pt'])('retained %s helper reasons have human names, localized causes and one truthful time boundary', async locale => {
    const f = await fixture(locale, true); await f.history.writer.flush();
    const { historyCopy } = await import('../../src/domain/history_copy.ts'); const { historyButton } = await import('../fixtures/history_center_dom.ts');
    const before = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length; historyButton('diagnostics', historyCopy(locale).text.read).click();
    await ready(() => f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length > before && document.querySelector('[data-history=diagnostics]')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('[data-helper-history-boundary]'));
    expect(document.querySelectorAll('[data-helper-history-boundary]')).toHaveLength(1); const row = document.querySelector('[data-history-entry]')!;
    expect(row.querySelector('h3')?.textContent).toBe(f.copy.helpers['center-shortcuts']); expect(row.textContent).toContain(f.copy.codes['refresh-failed']); expect(row.textContent).toContain(f.copy.scopes['retired-at-observation']);
    expect(document.querySelector('[data-helper-history-boundary]')?.textContent).toBe(f.copy.historyBoundary); expect(row.querySelector('button')).toBeNull();
});
