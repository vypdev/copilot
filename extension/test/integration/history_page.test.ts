// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderHistoryPage } from '../fixtures/history_page.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { historyTime } from '../../src/domain/history_display.ts';
import { EMPTY_HISTORY_VIEW } from '../../src/domain/history_client_view.ts';
import type { HistoryDocument } from '../../src/domain/history_document.ts';

const slot = (data: HistoryDocument) => ({ ...EMPTY_HISTORY_VIEW.slots, diagnostics: { phase: 'ready' as const, current: true, data } });
function button(label: string) { const value = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === label); if (!value) throw new Error(label); return value; }
it.each(['en', 'es', 'fr', 'pt'])('renders actual retained facts in %s without exporting native selectors or treating event scope as current quarantine', async locale => {
    const f = await historyWireExamples(); if (f.active.retained.state !== 'ready') throw new Error('missing');
    const data: HistoryDocument = { ...f.active, retained: { state: 'ready', snapshot: { ...f.active.retained.snapshot, entries: [
        ...f.active.retained.snapshot.entries, { sequence: 2, at: 1001, fact: { kind: 'helper', helper: 'runtime-health', code: 'cleanup-failed', scope: 'retired-at-observation' } },
        { sequence: 3, at: Number.MAX_SAFE_INTEGER, fact: { kind: 'helper', helper: 'center-shortcuts', code: 'mount-failed', scope: 'active-at-observation' } },
    ] } } };
    const h = renderHistoryPage({ slots: slot(data) }, 'diagnostics', locale);
    expect(document.body.textContent).toContain(h.copy.observations.committed); expect(document.body.textContent).toContain(h.copy.text.retiredHelper); expect(document.body.textContent).toContain(h.copy.text.activeHelper);
    expect(document.querySelectorAll('[data-history]')).toHaveLength(1); expect(document.querySelector('[data-history-entry]')?.getAttribute('data-history-entry')).toBe('3');
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(new Date(1001).toISOString()); expect(document.body.textContent).toContain(h.copy.text.timeUnavailable);
    expect(document.body.textContent).not.toContain('operationId'); expect(historyTime(0, 'invalid_locale')).toBeNull();
});
it('keeps reads and export available to observers but never offers collection effects', async () => {
    const f = await historyWireExamples(); const h = renderHistoryPage({ slots: slot(f.off) }, 'diagnostics', 'en', false);
    for (const key of ['enable', 'stop', 'clear'] as const) expect(button(h.copy.text[key]).disabled).toBe(true);
    button(h.copy.text.read).click(); button(h.copy.text.export).click(); expect(h.actions.read).toHaveBeenCalledExactlyOnceWith('diagnostics'); expect(h.actions.previewExport).toHaveBeenCalledExactlyOnceWith('diagnostics');
    expect(h.actions.preview).not.toHaveBeenCalled(); expect(h.actions.clear).not.toHaveBeenCalled();
});
it('routes explicit available actions to their own collection and never makes a write from rendering', async () => {
    const f = await historyWireExamples(); const h = renderHistoryPage({ slots: slot(f.off) }, 'diagnostics'); expect(h.actions.preview).not.toHaveBeenCalled();
    button(h.copy.text.enable).click(); button(h.copy.text.stop).click(); button(h.copy.text.clear).click();
    expect(h.actions.preview).toHaveBeenNthCalledWith(1, 'diagnostics', 'start'); expect(h.actions.preview).toHaveBeenNthCalledWith(2, 'diagnostics', 'stop'); expect(h.actions.clear).toHaveBeenCalledExactlyOnceWith('diagnostics');
});
it.each(['idle', 'reading', 'unavailable', 'stale'] as const)('a %s read never renders retained entries or an editable invented consent state', phase => {
    const h = renderHistoryPage({ slots: { ...EMPTY_HISTORY_VIEW.slots, diagnostics: { phase, current: false, data: null } } }, 'diagnostics');
    expect(document.querySelector('[data-history] [role=status]')?.textContent).toBe(h.copy.text[phase]); expect(document.querySelector('[data-history-consent]')).toBeNull(); expect(document.querySelector('[data-history-entry]')).toBeNull();
});
it.each(['future', 'corrupt', 'clock-invalid', 'exhausted', 'unavailable'] as const)('an unreadable %s retained journal is preserved, described and unavailable for export/clear', async state => {
    const f = await historyWireExamples(); const data = { ...f.off, retained: { state } }; const h = renderHistoryPage({ slots: slot(data) }, 'diagnostics');
    expect(document.body.textContent).toContain(state === 'unavailable' ? h.copy.text.unavailable : h.copy.issues[state]);
    expect(button(h.copy.text.export).disabled).toBe(true); expect(button(h.copy.text.clear).disabled).toBe(true); expect(document.querySelector('[data-history-entry]')).toBeNull();
});
it('separates saved intent, durable policy, temporary pauses, partial retention and the old restriction receipt', async () => {
    const f = await historyWireExamples(); const samples = [
        { ...f.off.collection, preference: 'unknown' as const, policy: 'unavailable' as const, policyRevision: null },
        { ...f.off.collection, preference: 'on' as const }, { ...f.off.collection, globallyPaused: true }, { ...f.off.collection, sessionBlocked: true },
        { ...f.off.collection, policy: 'future' as const }, { ...f.off.collection, policy: 'corrupt' as const },
    ];
    for (const [index, collection] of samples.entries()) {
        const h = renderHistoryPage({ slots: slot({ ...f.off, collection: { ...collection, restriction: { acknowledgement: 'unknown', observation: 'unavailable', policyRevision: null, sourceCurrentAtObservation: false } }, writer: { ...f.off.writer, pending: 1, incomplete: true, dropped: 1, issue: 'unknown' } }) }, 'diagnostics');
        expect(document.body.textContent).toContain(h.copy.text.gap); expect(document.body.textContent).toContain(h.copy.text.pending); expect(document.body.textContent).toContain(h.copy.text.historical);
        expect(document.querySelector('[data-history-consent]')?.textContent).toContain([h.copy.text.unknown, h.copy.text.activationPending, h.copy.text.globallyPaused, h.copy.text.temporary, h.copy.issues.future, h.copy.issues.corrupt][index]); await h.close();
    }
});
it('recent destinations link only to the closed center route and optional known feature; no raw private target is rendered', async () => {
    const f = await historyWireExamples(); if (f.off.retained.state !== 'ready') throw new Error('missing');
    const recents: HistoryDocument = { ...f.off, kind: 'recents', collection: { ...f.off.collection, kind: 'recents' }, writer: { ...f.off.writer, kind: 'recents' },
        retained: { state: 'ready', snapshot: { ...f.off.retained.snapshot, kind: 'recents', entries: [
            { sequence: 1, at: 1, fact: { kind: 'destination', route: 'features', featureId: 'BEX-NAV-01' } }, { sequence: 2, at: 2, fact: { kind: 'destination', route: 'privacy' } },
        ] } } };
    renderHistoryPage({ slots: { ...EMPTY_HISTORY_VIEW.slots, recents: { phase: 'ready', current: true, data: recents } } });
    expect([...document.querySelectorAll('.history-entries a')].map(node => node.getAttribute('href'))).toEqual(['#/privacy', '#/features/BEX-NAV-01']);
});
it.each(['active', 'paused'] as const)('a retained %s restriction report is historical and preserves its independent source/revision facts', async observation => {
    const f = await historyWireExamples(); const h = renderHistoryPage({ slots: slot({ ...f.off, collection: { ...f.off.collection,
        restriction: { acknowledgement: 'accepted', observation, policyRevision: 1, sourceCurrentAtObservation: true } } }) }, 'diagnostics');
    expect(document.querySelector('[data-history] details')?.textContent).toContain(h.copy.text[observation]); expect(document.querySelector('[data-history] details')?.textContent).toContain(h.copy.text.historical);
});
it('ready-without-current data and unavailable writer counters stay unknown and never revive retained entries', async () => {
    const f = await historyWireExamples(); const first = renderHistoryPage({ slots: { ...EMPTY_HISTORY_VIEW.slots, diagnostics: { phase: 'ready', current: false, data: f.off } } }, 'diagnostics');
    expect(document.body.textContent).toContain(first.copy.text.unavailable); await first.close();
    const h = renderHistoryPage({ slots: slot({ ...f.off, writer: { ...f.off.writer, epoch: null, observedRevision: null }, retained: { state: 'unavailable' } }) }, 'diagnostics');
    expect(document.querySelectorAll('[data-history-entry]')).toHaveLength(0); expect(document.querySelector('[data-history] details')?.textContent).toContain(h.copy.text.unknown);
});
