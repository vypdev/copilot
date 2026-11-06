// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { sessionPreferenceCenterFixture as fixture } from '../fixtures/session_preference_center.ts';
import { ready, button, change } from '../fixtures/center_app_dom.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { flushSync } from 'svelte';
import { pauseCopy } from '../../src/domain/pause_copy.ts';
import { deferred } from '../fixtures/runtime.ts';

async function preview(h: Awaited<ReturnType<typeof fixture>>) {
    change('session-density', 'compact'); button(h.common.messages.preview).click(); await ready(() => !!document.querySelector('#session-preference-review-heading'));
    expect(h.operationText()).toContain(h.copy.before); expect(h.operationText()).toContain(h.copy.after);
}
it('the actual native route reviews and commits one preference replacement, with focus and no saved setting or provider effect', async () => {
    const h = await fixture(); const saved = structuredClone(h.localValues.get(SETTINGS_KEY)); await preview(h);
    await ready(() => document.activeElement?.id === 'session-preference-review-heading'); expect(h.writes()).toHaveLength(0);
    button(h.copy.confirm).click(); await ready(() => h.operationText().includes(h.copy.committed)); expect(h.writes()).toHaveLength(1);
    expect(h.sessionValues.get(SESSION_PREFERENCES_KEY)).toMatchObject({ revision: 1, scope: { accountId: '1', repositoryId: '7' }, preferences: { density: 'compact' } });
    expect(h.localValues.get(SETTINGS_KEY)).toEqual(saved); expect(h.provider).not.toHaveBeenCalled(); expect(h.app.browser.api.permissions.request).not.toHaveBeenCalled();
    expect(h.operationText()).not.toContain('operationId'); expect(h.operationText()).not.toContain('selectionRevision');
});
it('cancelling the actual reviewed operation makes no native effect and does not claim success', async () => {
    const h = await fixture(); await preview(h); button(h.copy.cancel).click(); await ready(() => h.operationText().includes(h.copy.cancelled));
    expect(h.writes()).toHaveLength(0); expect(h.operationText()).not.toContain(h.copy.committed); button(h.copy.dismiss).click(); await ready(() => !document.querySelector('#session-preference-review-heading'));
});
it('blur blocks a native confirmation without discarding its draft, and foregrounding requires fresh metadata', async () => {
    const h = await fixture(); await preview(h); window.dispatchEvent(new Event('blur')); await ready(() => button(h.copy.confirm).disabled);
    button(h.copy.confirm).click(); expect(h.writes()).toHaveLength(0); window.dispatchEvent(new Event('focus'));
    await ready(() => !button(h.copy.confirm).disabled); button(h.copy.confirm).click(); await ready(() => h.operationText().includes(h.copy.committed)); expect(h.writes()).toHaveLength(1);
});
it('guarded navigation preserves an authored draft until explicitly discarded and never sends a confirmation', async () => {
    const h = await fixture(); change('session-density', 'compact'); window.location.hash = '#/appearance';
    const copy = centerCopy('en'); await ready(() => !!document.querySelector('section[role=alert]')); button(copy.messages.stay).click(); flushSync();
    expect((document.getElementById('session-density') as HTMLSelectElement).value).toBe('compact'); window.location.hash = '#/appearance';
    await ready(() => !!document.querySelector('section[role=alert]')); button(copy.messages.discard).click(); await ready(() => !!document.getElementById('center-theme')); expect(h.writes()).toHaveLength(0);
});
it('leaving an unsubmitted native review cancels its exact operation and does not alter native values', async () => {
    const h = await fixture(); await preview(h); window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('section[role=alert]'));
    button(centerCopy('en').messages.discard).click(); await ready(() => !!document.getElementById('center-theme'));
    expect(h.app.port.send.mock.calls.filter(([value]) => value.method === 'center.session-preferences.cancel')).toHaveLength(1); expect(h.writes()).toHaveLength(0);
});
it.each(['es', 'fr', 'pt'])('the actual %s native preference journey has complete localized review, cancellation and feature controls', async locale => {
    const h = await fixture(locale); await preview(h); button(h.copy.cancel).click(); await ready(() => h.operationText().includes(h.copy.cancelled));
    expect(document.documentElement.lang).toBe(locale); expect(document.body.textContent).toContain(h.copy.introduction); expect(h.writes()).toHaveLength(0);
});
it('unknown-result navigation warns that native effects remain and exact inspection does not repeat confirmation', async () => {
    const h = await fixture(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async input => { const result = await send(input); return input.method === 'center.session-preferences.confirm' ? null : result; });
    await preview(h); button(h.copy.confirm).click(); await ready(() => h.operationText().includes(h.copy.noReplay)); button(h.copy.inspect).click();
    await ready(() => h.operationText().includes(h.copy.committed)); expect(h.writes()).toHaveLength(1);
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('section[role=alert]'));
    button(pauseCopy('en').leave).click(); await ready(() => !!document.getElementById('center-theme')); expect(h.writes()).toHaveLength(1);
});
it('navigation with a lost native acknowledgement explains that leaving cannot undo or repeat the possible effect', async () => {
    const h = await fixture(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(async input => { const result = await send(input); return input.method === 'center.session-preferences.confirm' ? null : result; });
    await preview(h); button(h.copy.confirm).click(); await ready(() => h.operationText().includes(h.copy.noReplay));
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('section[role=alert]'));
    expect(document.querySelector('section[role=alert]')?.textContent).toContain(h.copy.noReplay);
    button(h.common.messages.stay).click(); await ready(() => !document.querySelector('section[role=alert]'));
    expect(window.location.hash).toBe('#/repositories/session'); expect(h.writes()).toHaveLength(1);
    expect(h.app.port.send.mock.calls.filter(([value]) => value.method === 'center.session-preferences.confirm')).toHaveLength(1);
});
it('a native write with unknown readback keeps precaution and can be adopted explicitly without another submission', async () => {
    const h = await fixture(); vi.mocked(h.sessionArea.set).mockImplementation(async value => { if (!Object.hasOwn(value, SESSION_PREFERENCES_KEY)) for (const [key, data] of Object.entries(value)) h.sessionValues.set(key, data); });
    await preview(h); button(h.copy.confirm).click(); await ready(() => h.operationText().includes(h.copy.unknown)); button(h.copy.dismiss).click();
    await ready(() => !document.querySelector('#session-preference-review-heading') && !![...document.querySelectorAll('button')].find(node => node.textContent === h.copy.adopt));
    button(h.copy.adopt).click(); await ready(() => h.operationText().includes(h.copy.adoption)); button(h.copy.confirm).click(); await ready(() => h.operationText().includes(h.copy.reconciled)); expect(h.writes()).toHaveLength(1);
});
it('shutdown during leave-triggered cancellation cannot navigate a retired native page or submit the old draft', async () => {
    const h = await fixture(); await preview(h); const gate = deferred<unknown>(); const send = h.app.port.send.getMockImplementation()!;
    h.app.port.send.mockImplementation(input => input.method === 'center.session-preferences.cancel' ? gate.promise : send(input));
    window.location.hash = '#/appearance'; await ready(() => !!document.querySelector('section[role=alert]')); button(h.common.messages.discard).click();
    await ready(() => h.app.port.send.mock.calls.some(([value]) => value.method === 'center.session-preferences.cancel')); h.app.stop();
    gate.resolve({ state: 'result', outcome: { state: 'cancelled' }, facts: { attempt: 'unobserved', acknowledgement: null, observation: null }, sourceTree: h.app.port.sourceTree });
    await ready(() => document.querySelector('.center') === null); expect(window.location.hash).toBe('#/repositories/session'); expect(h.writes()).toHaveLength(0);
});
