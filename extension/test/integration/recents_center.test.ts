// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi, type MockInstance } from 'vitest';
import { CenterClient, type CenterClientPort } from '../../src/application/center_client.ts';
import { RecentsClient } from '../../src/application/recents_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import { tick } from 'svelte';
import { renderHistory, historyButton, historyReview } from '../fixtures/history_center_dom.ts';
import { ready, navigate, button, change } from '../fixtures/center_app_dom.ts';
import { activeRecents } from '../fixtures/recents_gateway.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';

function entries(f: Awaited<ReturnType<typeof renderHistory>>) {
    return (f.documents.get('recents') as { entries?: { fact: { route: string; featureId?: string } }[] } | undefined)?.entries ?? [];
}
async function captured(f: Awaited<ReturnType<typeof renderHistory>>, captures: MockInstance<RecentsClient['refresh']>): Promise<void> {
    await vi.waitFor(async () => {
        const calls = f.app.port.send.mock.calls; const index = calls.map(([m], i) => m.method === 'center.recents.capture' ? i : -1).filter(i => i >= 0).at(-1) ?? -1; expect(index).toBeGreaterThanOrEqual(0);
        const result = await f.app.port.send.mock.results[index].value as { permit?: string }; expect(result.permit).toMatch(/^visit-/u);
    });
    // Native delivery precedes permit adoption; await the existing read without requesting another capture.
    await Promise.all(captures.mock.results.map(result => { expect(result.type).toBe('return'); return result.value; }));
    await tick();
}
it('an initially opted-in actual application records only its admitted first current view', async () => {
    const f = await renderHistory('privacy', 'en', activeRecents); await ready(() => entries(f).length === 1);
    expect(entries(f)[0].fact).toEqual({ kind: 'destination', route: 'privacy' }); expect(f.app.browser.api.permissions.contains).toHaveBeenCalledTimes(3);
    expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled(); expect(f.port.set).not.toHaveBeenCalled();
});
it('off startup and accepted off navigation cannot be retrospectively added after enabling collection', async () => {
    const captures = vi.spyOn(RecentsClient.prototype, 'refresh');
    const entered = deferred<void>(); const release = deferred<void>();
    const proto = CenterClient.prototype as unknown as {
        request(message: Parameters<CenterClientPort['send']>[0], secondary?: boolean): Promise<Record<string, unknown> | null>;
    };
    const request = proto.request;
    vi.spyOn(proto, 'request').mockImplementation(async function (this: typeof proto, message, secondary) {
        const body = await request.call(this, message, secondary);
        if (message.method === 'center.recents.capture' && typeof body?.permit === 'string') {
            entered.resolve(); await release.promise;
        }
        return body;
    });
    const f = await renderHistory(); await navigate('work'); await navigate('activity'); expect(entries(f)).toHaveLength(0);
    await ready(() => !historyButton('recents', f.copy.text.enable).disabled, 'recents consent review is enabled');
    historyButton('recents', f.copy.text.enable).click(); await historyReview(); button(f.copy.text.confirm).click();
    await ready(() => document.querySelector('.history-review')?.textContent?.includes(f.copy.reasons.done) === true);
    let settled = false; const waiting = captured(f, captures).then(() => { settled = true; });
    try {
        await entered.promise;
        let observations = 0; await ready(() => ++observations > 1);
        expect(settled).toBe(false);
        expect(entries(f)).toHaveLength(0);
    } finally { release.resolve(); await waiting; }
    button(f.copy.text.close).click(); await ready(() => !document.querySelector('.history-review'));
    expect(entries(f)).toHaveLength(0); await navigate('appearance'); await ready(() => entries(f).length === 1);
    expect(entries(f).map(row => row.fact.route)).toEqual(['appearance']);
});
it('a guarded destination and Stay are not visits; explicit discard records only the actually accepted destination', async () => {
    const f = await renderHistory('appearance', 'en', activeRecents); await ready(() => entries(f).length === 1); await ready(() => !!document.querySelector('#center-theme'));
    change('center-theme', 'dark'); window.location.hash = '#/privacy'; await ready(() => !!document.querySelector('section[role=alert]')); button('Keep editing').click(); await tick();
    expect(entries(f).map(row => row.fact.route)).toEqual(['appearance']);
    window.location.hash = '#/privacy'; await ready(() => !!document.querySelector('section[role=alert]')); button('Discard draft and leave').click();
    await ready(() => entries(f).length === 2); expect(entries(f).map(row => row.fact.route)).toEqual(['appearance', 'privacy']);
});
it('private profile detail is stripped before the real IPC and registered feature detail remains a safe destination', async () => {
    const f = await renderHistory('activity', 'en', activeRecents); await ready(() => entries(f).length === 1);
    await navigate('profiles/private-team'); await ready(() => entries(f).length === 2);
    await navigate('features/BEX-NAV-01'); await ready(() => entries(f).length === 3);
    expect(entries(f).map(row => row.fact)).toEqual([{ kind: 'destination', route: 'activity' }, { kind: 'destination', route: 'profiles' }, { kind: 'destination', route: 'features', featureId: 'BEX-NAV-01' }]);
    const observations = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.recents.observe'); expect(JSON.stringify(observations)).not.toContain('private-team');
});
it('an observer window records its own consented navigation while authored settings stay read-only', async () => {
    const f = await renderHistory('appearance', 'en', async owner => { await activeRecents(owner); await owner.open({ ...CENTER_SENDER, documentId: 'editor-document', tab: { id: 2, incognito: false } }); });
    await ready(() => entries(f).length === 1); await ready(() => !!document.querySelector('fieldset'));
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true); await navigate('privacy'); await ready(() => entries(f).length === 2); expect(f.port.set).not.toHaveBeenCalled();
});
it.each(['en', 'es', 'fr', 'pt'])('an unconfirmed native delivery is disclosed in %s independently from history reads and is never resent', async locale => {
    const f = await renderHistory('activity', locale, activeRecents); await ready(() => entries(f).length === 1); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => message.method === 'center.recents.observe' ? null : send(message));
    await navigate('privacy'); await ready(() => !!document.querySelector('[data-visit-uncertain]'));
    expect(document.querySelector('[data-visit-uncertain]')?.textContent).toBe(f.copy.text.visitsUnconfirmed);
    const count = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.recents.observe').length; historyButton('recents', f.copy.text.read).click();
    await ready(() => !!document.querySelector('[data-history=recents] [data-history-consent]')); expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.recents.observe')).toHaveLength(count);
});
it('hidden navigation and becoming visible again do not backfill an unobserved destination', async () => {
    const f = await renderHistory('activity', 'en', activeRecents); await ready(() => entries(f).length === 1);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
    await navigate('appearance'); expect(entries(f).map(row => row.fact.route)).toEqual(['activity']);
    visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(entries(f).map(row => row.fact.route)).toEqual(['activity']); await navigate('privacy'); await ready(() => entries(f).length === 2);
    expect(entries(f).map(row => row.fact.route)).toEqual(['activity', 'privacy']);
});
it('blur and focus refresh the view without manufacturing another visit to the current destination', async () => {
    const f = await renderHistory('activity', 'en', activeRecents); await ready(() => entries(f).length === 1);
    window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); await tick();
    historyButton('recents', f.copy.text.read).click(); await tick(); expect(entries(f).map(row => row.fact.route)).toEqual(['activity']);
    await navigate('appearance'); await ready(() => entries(f).length === 2); expect(entries(f).map(row => row.fact.route)).toEqual(['activity', 'appearance']);
});
it('a disposed application removes its producer and cannot record subsequent route changes', async () => {
    const f = await renderHistory('activity', 'en', activeRecents); await ready(() => entries(f).length === 1);
    f.app.stop(); await tick(); const calls = f.app.port.send.mock.calls.length; window.location.hash = '#/privacy'; await tick();
    expect(f.app.port.send).toHaveBeenCalledTimes(calls); expect(entries(f).map(row => row.fact.route)).toEqual(['activity']); expect(document.body.textContent).toBe('');
});
