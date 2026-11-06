// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { pauseCenterFixture as fixture } from '../fixtures/pause_center.ts';
import { ready, button } from '../fixtures/center_app_dom.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { pauseObservationCopy } from '../../src/domain/pause_observation_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';

it.each(['en', 'es', 'fr', 'pt'])('the actual %s native pause route reviews and confirms one scoped native change without changing saved settings or grants', async locale => {
    const h = await fixture(locale); const saved = structuredClone(h.currentSettings()); button(h.copy.pause).click();
    await ready(() => !!document.querySelector('#pause-review-heading')); expect(document.activeElement?.id).toBe('pause-review-heading');
    expect(h.native.port.set).not.toHaveBeenCalled(); expect(h.operationText()).toContain(h.copy.before); expect(h.operationText()).toContain(h.copy.after);
    button(h.copy.confirm).click(); await ready(() => h.operationText().includes(pauseObservationCopy(locale).results.committed));
    expect(h.native.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ schemaVersion: 1, revision: 1, emergency: true, tabs: [] }); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect(h.currentSettings()).toEqual(saved); expect(h.sessions.reader.read).not.toHaveBeenCalled(); expect(h.browser.api.permissions.request).not.toHaveBeenCalled();
    expect(h.text()).not.toContain('operationId'); expect(h.text()).not.toContain(h.owner.clientId);
});
it('cancelling a reviewed pause never writes native state and leaves its cancellation separate from success', async () => {
    const h = await fixture(); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
    button(h.copy.cancel).click(); await ready(() => h.operationText().includes(pauseObservationCopy('en').results.cancelled)); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(h.operationText()).not.toContain(pauseObservationCopy('en').results.committed); button(h.copy.dismiss).click(); await ready(() => !document.querySelector('#pause-review-heading'));
});
it.each(['future', 'corrupt', 'unavailable'] as const)('%s saved preferences cannot disable independently authorized native pause controls', async state => {
    const raw = state === 'future' ? { schemaVersion: 99, keep: true } : { damaged: true };
    const h = await fixture('es', async owner => {
        if (state === 'unavailable') vi.mocked(owner.port.get).mockRejectedValue(new Error('preferences unavailable'));
        else owner.values.set(SETTINGS_KEY, raw);
    });
    button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); button(h.copy.confirm).click();
    await ready(() => h.operationText().includes(pauseObservationCopy('es').results.committed)); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    if (state !== 'unavailable') expect(h.currentSettings()).toEqual(raw); expect(h.sessions.reader.read).not.toHaveBeenCalled();
});
it('an accepted no-op remains unconfirmed; current-state reading does not clear precaution or repeat confirmation', async () => {
    const h = await fixture(); vi.mocked(h.native.port.set).mockResolvedValue(undefined); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); button(h.copy.confirm).click();
    await ready(() => h.operationText().includes(pauseObservationCopy('en').results.unknown)); await ready(() => !!document.querySelector('[data-pause-precaution]'));
    const count = h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.pauses.confirm').length;
    const reads = h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.pauses.read').length; button(h.copy.read).click();
    await ready(() => h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.pauses.read').length > reads && h.text().includes(h.copy.reads.ready) && !!document.querySelector('[data-pause-precaution]'));
    expect(h.operationText()).toContain(pauseObservationCopy('en').results.unknown); expect(document.querySelector('[data-pause-precaution]')).not.toBeNull();
    expect(h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.pauses.confirm')).toHaveLength(count); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
it('explicit adoption previews the retained scopes and ends only precaution without a second native write', async () => {
    const h = await fixture(); vi.mocked(h.native.port.set).mockResolvedValue(undefined); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); button(h.copy.confirm).click();
    await ready(() => h.operationText().includes(pauseObservationCopy('en').results.unknown)); button(h.copy.dismiss).click(); await ready(() => !document.querySelector('#pause-review-heading') && h.text().includes(h.copy.reads.ready));
    button(h.copy.adopt).click(); await ready(() => h.operationText().includes(h.copy.adoption)); button(h.copy.confirm).click();
    await ready(() => h.operationText().includes(pauseObservationCopy('en').results.reconciled)); await ready(() => !document.querySelector('[data-pause-precaution]'));
    expect(h.native.port.set).toHaveBeenCalledTimes(1); expect(h.operationText()).toContain(historyCopy('en').text.observation); expect(h.operationText()).not.toContain(historyCopy('en').acknowledgements.accepted);
});
it('a lost delivery is inspected by exact retained operation without retransmitting the native confirmation', async () => {
    const h = await fixture(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async message => { const reply = await send(message); return message.method === 'center.pauses.confirm' ? null : reply; });
    button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); button(h.copy.confirm).click();
    await ready(() => h.operationText().includes(h.copy.phases.unknown)); button(h.copy.inspect).click();
    await ready(() => h.operationText().includes(pauseObservationCopy('en').results.committed)); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect(h.app.port.send.mock.calls.filter(([message]) => message.method === 'center.pauses.confirm')).toHaveLength(1);
    expect(h.app.port.send.mock.calls.some(([message]) => message.method === 'center.pauses.result')).toBe(true);
});
it('local filtering cannot trigger native reads, save preferences or create an unsaved authoring draft', async () => {
    const h = await fixture('en', async owner => { vi.mocked(owner.browser.api.tabs.query).mockResolvedValue([{ id: 7 }]); });
    const input = document.querySelector<HTMLInputElement>('#pause-tab-filter')!; const calls = h.app.port.send.mock.calls.length;
    input.value = 'missing-repository'; input.dispatchEvent(new Event('input', { bubbles: true })); await ready(() => h.text().includes(h.copy.noMatches));
    expect(h.app.port.send).toHaveBeenCalledTimes(calls); window.location.hash = '#/appearance';
    await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#/appearance'); expect(document.querySelector('[data-native-pauses]')).toBeNull();
    expect(document.body.textContent).not.toContain(centerCopy('en').messages.unsaved); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a selected native tab retirement expires the unsubmitted review without writing or cancelling an unrelated scope', async () => {
    const h = await fixture('en', async owner => { vi.mocked(owner.browser.api.tabs.query).mockResolvedValue([{ id: 7 }]); });
    (document.querySelector('[data-native-pause-tab="7"] button') as HTMLButtonElement).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
    h.center.releaseTab(7); h.bridge({ version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: true });
    await ready(() => h.operationText().includes(h.copy.phases.stale)); expect(document.querySelector('[data-pause-review] [data-pause-scopes]')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('forged target notifications from web content cannot expire a valid native preview', async () => {
    const h = await fixture('en', async owner => { vi.mocked(owner.browser.api.tabs.query).mockResolvedValue([{ id: 7 }]); });
    (document.querySelector('[data-native-pause-tab="7"] button') as HTMLButtonElement).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
    h.bridge({ version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: true }, { id: h.browser.api.runtime.id, tab: { id: 7 } });
    h.bridge({ version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: true }, { id: 'foreign-extension' });
    button(h.copy.confirm).click(); await ready(() => h.operationText().includes(pauseObservationCopy('en').results.committed)); expect(h.native.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ tabs: [7] });
});
it('leaving a completed native operation keeps its accepted effect and never inverse-writes it', async () => {
    const h = await fixture(); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); button(h.copy.confirm).click();
    await ready(() => h.operationText().includes(pauseObservationCopy('en').results.committed)); window.location.hash = '#/appearance';
    await ready(() => document.body.textContent?.includes(h.copy.leave) === true); button(h.copy.leave).click();
    await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#/appearance');
    expect(h.native.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ emergency: true }); expect(h.native.port.set).toHaveBeenCalledTimes(1);
});
