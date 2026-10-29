// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { renderHistory, historyButton, historyReview } from '../fixtures/history_center_dom.ts';
import { ready, button, navigate } from '../fixtures/center_app_dom.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

it('opens actual history without consent writes, provider reads, browser history access or fabricated current facts', async () => {
    const f = await renderHistory(); expect(document.querySelectorAll('[data-history]')).toHaveLength(2);
    expect(document.querySelector('[data-history-consent]')?.textContent).toContain(f.copy.text.off);
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.sessions.reader.read).not.toHaveBeenCalled(); expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled();
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').map(([m]) => 'kind' in m && m.kind)).toEqual(['diagnostics', 'recents']);
    expect(document.body.textContent).not.toContain('operationId'); expect(document.body.textContent).not.toContain('Optional access');
});
it('reviews and confirms start, keeps each phase fact, refreshes canonical preferences, then stops and clears the actual retained generation', async () => {
    const f = await renderHistory('diagnostics'); historyButton('diagnostics', f.copy.text.enable).click(); await historyReview();
    expect(document.activeElement?.id).toBe('history-review-heading'); expect(f.port.set).not.toHaveBeenCalled(); button(f.copy.text.confirm).click();
    await ready(() => document.querySelector('.history-review')?.textContent?.includes(f.copy.reasons.done) === true);
    await ready(() => document.querySelector('.revision code')?.textContent === '1');
    expect(document.querySelector('.history-review')?.textContent).toContain(f.copy.text.phasePreference); expect(document.querySelector('.history-review')?.textContent).toContain(f.copy.text.phasePolicy);
    button(f.copy.text.close).click(); await ready(() => !document.querySelector('.history-review'));
    f.history.writer.admit('diagnostics', writerFact('settled'), () => true); await f.history.writer.flush(); historyButton('diagnostics', f.copy.text.read).click();
    await ready(() => document.querySelectorAll('[data-history-entry]').length === 1);
    historyButton('diagnostics', f.copy.text.stop).click(); await historyReview(); button(f.copy.text.confirm).click();
    await ready(() => document.querySelector('.history-review')?.textContent?.includes(f.copy.reasons.done) === true); button(f.copy.text.close).click();
    await ready(() => !historyButton('diagnostics', f.copy.text.clear).disabled); historyButton('diagnostics', f.copy.text.clear).click(); await historyReview();
    expect(document.querySelector('.history-review')?.textContent).toContain(f.copy.text.clearControls); expect(f.documents.get('diagnostics')).toMatchObject({ entries: [{ sequence: 1 }] });
    button(f.copy.text.confirm).click(); await ready(() => document.querySelectorAll('[data-history-entry]').length === 0 && document.querySelector('.history-review')?.textContent?.includes(f.copy.text.verified) === true);
    expect(f.documents.get('diagnostics')).toMatchObject({ epoch: 1, entries: [] }); expect(f.values.get(SETTINGS_KEY)).toMatchObject({ current: { center: { diagnostics: false } } });
});
it('guards both previews and unconfirmed writes across navigation, then checks an unknown result without another write', async () => {
    const f = await renderHistory(); historyButton('diagnostics', f.copy.text.enable).click(); await historyReview();
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('.notice [type=button]'));
    button('Keep editing').click(); flushSync(); expect(document.querySelector('.history-review')).not.toBeNull();
    const send = f.app.port.send.getMockImplementation()!; const entered = deferred<void>(); const release = deferred<void>();
    f.app.port.send.mockImplementation(async message => {
        const value = await send(message); if (message.method === 'center.collection.confirm') { entered.resolve(); await release.promise; return null; } return value;
    });
    button(f.copy.text.confirm).click(); await entered.promise; await ready(() => button(f.copy.text.close).disabled);
    window.location.hash = '#/profiles'; await ready(() => !!document.querySelector('.notice [type=button]'));
    expect(button('Discard draft and leave').disabled).toBe(true); button('Keep editing').click(); release.resolve();
    await ready(() => !button(f.copy.text.close).disabled); const writes = vi.mocked(f.policies.execute).mock.calls.filter(([, command]) => command.type === 'set').length;
    button(f.copy.text.inspect).click(); await ready(() => document.querySelector('.history-review')?.textContent?.includes(f.copy.reasons.done) === true);
    expect(vi.mocked(f.policies.execute).mock.calls.filter(([, command]) => command.type === 'set')).toHaveLength(writes);
    button(f.copy.text.close).click(); await ready(() => !document.querySelector('.history-review')); await navigate('appearance'); await ready(() => !!document.querySelector('#center-theme'));
});
it('history-only invalidation purges an export without refreshing primary settings or invoking a provider', async () => {
    const f = await renderHistory(); historyButton('diagnostics', f.copy.text.export).click(); await ready(() => !!document.querySelector('#history-export-heading'));
    expect(document.activeElement?.id).toBe('history-export-heading'); expect(document.querySelector('textarea')?.readOnly).toBe(true);
    const before = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.read').length; const provider = vi.mocked(f.sessions.reader.read).mock.calls.length;
    const notify = [...f.app.browser.onMessage.listeners][0]; notify({ version: 1, method: 'center.history.invalidated' }, { id: 'test' }, () => undefined);
    flushSync(); expect(document.querySelector('textarea')).toBeNull();
    await ready(() => !!document.querySelector('[data-history-consent]'));
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.read')).toHaveLength(before); expect(f.sessions.reader.read).toHaveBeenCalledTimes(provider);
});
it('failed downloads retain the exact review and expose a local recovery message', async () => {
    const f = await renderHistory(); historyButton('diagnostics', f.copy.text.export).click(); await ready(() => !!document.querySelector('#history-export-heading'));
    const content = document.querySelector('textarea')!.value; vi.stubGlobal('URL', { createObjectURL: () => { throw new Error('private-native-path'); } });
    button(f.copy.text.download).click(); await ready(() => document.body.textContent?.includes(f.copy.text.downloadFailed) === true);
    expect(document.querySelector('textarea')!.value).toBe(content); expect(document.body.textContent).not.toContain('private-native-path');
    button(f.copy.text.cancel).click(); await ready(() => !document.querySelector('#history-export-heading'));
});
it('the actual Privacy history section reads independently of its browser-permission report and never requests a grant', async () => {
    const f = await renderHistory('privacy'); await ready(() => !!document.querySelector('[data-permission-status]'));
    const before = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length;
    historyButton('diagnostics', f.copy.text.read).click(); await ready(() => f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length > before);
    expect(document.querySelectorAll('[data-browser-capability]')).toHaveLength(3); expect(f.app.browser.api.permissions.contains).toHaveBeenCalledTimes(3);
    expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled(); expect(f.sessions.reader.read).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
