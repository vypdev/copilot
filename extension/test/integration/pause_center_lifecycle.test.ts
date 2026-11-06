// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { pauseCenterFixture as fixture } from '../fixtures/pause_center.ts';
import { ready, button } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { pauseObservationCopy } from '../../src/domain/pause_observation_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';

it('a genuinely suspended saved-preference read cannot prevent emergency review or native confirmation', async () => {
    const gate = deferred<Record<string, unknown>>(); const h = await fixture('en', async owner => { vi.mocked(owner.port.get).mockReturnValue(gate.promise); });
    try {
        expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
        button(h.copy.confirm).click(); await ready(() => h.operationText().includes(pauseObservationCopy('en').results.committed)); expect(h.native.port.set).toHaveBeenCalledOnce();
        expect(h.sessions.reader.read).not.toHaveBeenCalled();
    } finally { h.app.stop(); gate.resolve({}); }
});
it('blur retires current tab metadata and blocks a pending review until fresh focused metadata is independently available', async () => {
    const h = await fixture(); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
    window.dispatchEvent(new Event('blur')); await ready(() => !h.text().includes('octo/example'));
    expect(button(h.copy.confirm).disabled).toBe(true); const count = h.app.port.send.mock.calls.filter(([input]) => input.method === 'center.pauses.read').length;
    button(h.copy.confirm).click(); expect(h.native.port.set).not.toHaveBeenCalled(); window.dispatchEvent(new Event('focus'));
    await ready(() => h.app.port.send.mock.calls.filter(([input]) => input.method === 'center.pauses.read').length > count && !button(h.copy.confirm).disabled);
    button(h.copy.confirm).click(); await ready(() => h.operationText().includes(pauseObservationCopy('en').results.committed));
});
it('tab completion refreshes choices without retiring a preview of the same still-current native source', async () => {
    const h = await fixture('en', async owner => { vi.mocked(owner.browser.api.tabs.query).mockResolvedValue([{ id: 7 }]); });
    (document.querySelector('[data-native-pause-tab="7"] button') as HTMLButtonElement).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
    h.bridge({ version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: false }); await ready(() => !button(h.copy.confirm).disabled);
    expect(h.operationText()).toContain(h.copy.phases.preview); button(h.copy.confirm).click(); await ready(() => h.operationText().includes(pauseObservationCopy('en').results.committed));
});
it('a cancelled navigation preserves its pending review, while leaving an unsubmitted review cancels only its exact ID', async () => {
    const h = await fixture(); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); window.location.hash = '#/appearance';
    const copy = centerCopy('en'); await ready(() => !!document.querySelector('[aria-label="' + copy.messages.unsaved + '"]'));
    button(copy.messages.stay).click(); await ready(() => !document.querySelector('[aria-label="' + copy.messages.unsaved + '"]'));
    expect(h.operationText()).toContain(h.copy.phases.preview); window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('[aria-label="' + copy.messages.unsaved + '"]'));
    button(copy.messages.discard).click(); await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#/appearance'); expect(h.native.port.set).not.toHaveBeenCalled();
    expect(h.app.port.send.mock.calls.filter(([input]) => input.method === 'center.pauses.cancel')).toHaveLength(1);
});
it('a source identity mismatch purges pending private selectors and cannot send a confirmation from the retired package', async () => {
    const h = await fixture(); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async input => input.method === 'center.pauses.read' ? { sourceTree: 'e'.repeat(64), state: 'unavailable' } : send(input));
    button(h.copy.read).click(); await ready(() => h.operationText().includes(h.copy.phases.stale)); expect(document.querySelector('[data-pause-scopes]')).toBeNull(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('unknown-result navigation names its risk and leaving preserves the worker precaution without retrying', async () => {
    const h = await fixture(); vi.mocked(h.native.port.set).mockResolvedValue(undefined); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading'));
    button(h.copy.confirm).click(); await ready(() => h.operationText().includes(pauseObservationCopy('en').results.unknown)); window.location.hash = '#/appearance';
    await ready(() => !!document.querySelector('section[role=alert]')); expect(document.querySelector('section[role=alert]')?.textContent).toContain(h.copy.noReplay); button(h.copy.leave).click();
    await ready(() => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#/appearance'); expect(h.native.guard.uncertain).toBe(true); expect(h.native.port.set).toHaveBeenCalledOnce();
});
it('shutdown while a leave-triggered cancellation is suspended cannot navigate a retired native page', async () => {
    const h = await fixture(); button(h.copy.pause).click(); await ready(() => !!document.querySelector('#pause-review-heading')); const send = h.app.port.send.getMockImplementation()!;
    const gate = deferred<unknown>(); h.app.port.send.mockImplementation(input => input.method === 'center.pauses.cancel' ? gate.promise : send(input)); window.location.hash = '#/appearance';
    const copy = centerCopy('en'); await ready(() => !!document.querySelector('section[role=alert]')); button(copy.messages.discard).click();
    await ready(() => h.app.port.send.mock.calls.some(([input]) => input.method === 'center.pauses.cancel')); h.app.stop(); gate.resolve({ state: 'cancelled', sourceTree: h.app.port.sourceTree });
    await ready(() => document.querySelector('.center') === null); expect(window.location.hash).toBe('#/repositories/pauses'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a native observer sees a pending control claim, cannot repeat it, and can author only after the new editor identity is established', async () => {
    const h = await fixture('en', async owner => { owner.center.releaseTab(1); await owner.open({ ...CENTER_SENDER, documentId: 'other-window', tab: { id: 2, incognito: false } }); });
    const copy = centerCopy('en'); expect(button(h.copy.pause).disabled).toBe(true); const send = h.app.port.send.getMockImplementation()!; const gate = deferred<unknown>();
    h.app.port.send.mockImplementation(input => input.method === 'center.claim' ? gate.promise : send(input)); button(copy.messages.takeControl).click();
    await ready(() => document.querySelector('main')?.getAttribute('aria-busy') === 'true'); expect(button(copy.messages.takeControl).disabled).toBe(true); button(copy.messages.takeControl).click();
    const requests = h.app.port.send.mock.calls.filter(([input]) => input.method === 'center.claim'); expect(requests).toHaveLength(1); gate.resolve(await send(requests[0][0]));
    await ready(() => !button(h.copy.pause).disabled); expect(document.body.textContent).toContain(copy.messages.editor); expect(h.native.port.set).not.toHaveBeenCalled();
});
