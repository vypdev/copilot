// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderHistoryPage } from '../fixtures/history_page.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { publicHistoryReview } from '../../src/domain/history_review_projection.ts';
import type { HistoryReview } from '../../src/domain/history_client_view.ts';
import type { CollectionSettled } from '../../src/domain/collection_review.ts';

function button(label: string) { const value = [...document.querySelectorAll<HTMLButtonElement>('.history-review button, [aria-labelledby=history-export-heading] button')].find(node => node.textContent === label); if (!value) throw new Error(label); return value; }
it('shows the exact local start/stop delta and requires its explicit confirm or cancellation gesture', async () => {
    const f = await historyWireExamples(); if (f.start.state !== 'preview' || f.stop.state !== 'preview') throw new Error('missing');
    for (const plan of [f.start, f.stop, { ...f.start, policyBefore: 'unknown' as const }]) {
        const h = renderHistoryPage({ review: publicHistoryReview({ family: 'collection', plan }, 'preview') });
        expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.text.before); expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.text.after);
        expect(document.body.textContent).not.toContain(plan.operationId); expect(h.actions.confirm).not.toHaveBeenCalled(); button(h.copy.text.confirm).click(); button(h.copy.text.cancel).click();
        expect(h.actions.confirm).toHaveBeenCalledOnce(); expect(h.actions.cancel).toHaveBeenCalledOnce(); await h.close();
    }
});
it('clear review discloses its generated-entry scope and the safety controls that remain', async () => {
    const f = await historyWireExamples(); if (f.clear.state !== 'preview') throw new Error('missing');
    const h = renderHistoryPage({ review: publicHistoryReview({ family: 'clear', plan: f.clear }, 'preview') }, 'privacy', 'en', false);
    expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.text.clearControls); expect(button(h.copy.text.confirm).disabled).toBe(true); expect(button(h.copy.text.cancel).disabled).toBe(false);
});
it.each(['committing', 'cancelling', 'unknown', 'stale', 'result'] as const)('a %s review never offers another confirmation and preserves an explicit outcome check/close boundary', async phase => {
    const f = await historyWireExamples(); if (f.clear.state !== 'preview') throw new Error('missing'); const busy = phase === 'committing' || phase === 'cancelling';
    const h = renderHistoryPage({ review: publicHistoryReview({ family: 'clear', plan: f.clear }, phase), busy, checking: busy });
    expect(document.querySelector('.history-review')?.textContent).not.toContain(h.copy.text.confirm); expect(button(h.copy.text.close).disabled).toBe(busy);
    if (phase === 'unknown') { button(h.copy.text.inspect).click(); expect(h.actions.inspect).toHaveBeenCalledOnce(); }
    if (!busy) { button(h.copy.text.close).click(); expect(h.actions.dismiss).toHaveBeenCalledOnce(); }
});
it('renders every independent preference result without converting policy success or uncertainty into an atomic success', async () => {
    const f = await historyWireExamples(); if (f.start.state !== 'preview' || f.started.state !== 'settled') throw new Error('missing');
    const phases: readonly CollectionSettled['preference'][] = [
        { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true }, { state: 'replayed', revision: 1 }, { state: 'already', revision: 0 }, { state: 'not-attempted', revision: 0 },
        { state: 'conflict' }, { state: 'stale' }, { state: 'invalid' }, { state: 'unavailable' },
        { state: 'unknown', observedRevision: null, acknowledgement: 'unknown', observation: 'unavailable' },
        { state: 'unknown', observedRevision: 1, acknowledgement: 'accepted', observation: 'changed' },
    ];
    for (const preference of phases) {
        const value: CollectionSettled = { ...f.started, preference, reason: 'preference-unconfirmed', observedPreference: null, preferenceVerifiedAtObservation: false,
            policy: { acknowledgement: 'unknown', observation: 'unavailable', revision: null, attributed: false }, admittedAtObservation: false, sourceCurrentAtObservation: false };
        const h = renderHistoryPage({ review: publicHistoryReview({ family: 'collection', plan: f.start }, 'result', value) });
        expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.steps[preference.state]); expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.reasons['preference-unconfirmed']);
        expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.text.unverified); expect(document.querySelector('.history-review')?.textContent).toContain(h.copy.text.historical); await h.close();
    }
});
it('renders clear acknowledgements, unconfirmed results, expiry and cancellation without claiming current completion', async () => {
    const f = await historyWireExamples(); if (f.clear.state !== 'preview') throw new Error('missing');
    const outcomes: readonly NonNullable<HistoryReview['outcome']>[] = [
        { state: 'observed-cleared', acknowledgement: 'unknown', epoch: 1, revision: 2, sourceCurrentAtObservation: false },
        { state: 'unknown', acknowledgement: 'accepted', observation: 'changed', sourceCurrentAtObservation: false },
        { state: 'not-applied', reason: 'aborted' }, { state: 'cancelled' }, { state: 'not-submitted' }, { state: 'pending' }, { state: 'expired' },
    ];
    for (const outcome of outcomes) {
        const h = renderHistoryPage({ review: publicHistoryReview({ family: 'clear', plan: f.clear }, outcome.state === 'unknown' ? 'unknown' : 'result', outcome) });
        expect(document.querySelector('.history-review [role=status]')?.textContent?.trim().length).toBeGreaterThan(0); await h.close();
    }
});
it('keeps a reviewed JSON body escaped and requires distinct download/cancel actions; failed delivery is visible', () => {
    const h = renderHistoryPage({ exportReview: { kind: 'diagnostics', epoch: 0, revision: 0, content: '<img src=x onerror=alert(1)>' }, exportFailed: true, issue: 'unavailable' });
    expect(document.querySelector('img')).toBeNull(); expect(document.querySelector('textarea')?.value).toBe('<img src=x onerror=alert(1)>'); expect(document.body.textContent).toContain(h.copy.text.downloadFailed);
    expect(h.actions.downloadExport).not.toHaveBeenCalled(); button(h.copy.text.download).click(); button(h.copy.text.cancel).click();
    expect(h.actions.downloadExport).toHaveBeenCalledOnce(); expect(h.actions.cancelExport).toHaveBeenCalledOnce();
});
