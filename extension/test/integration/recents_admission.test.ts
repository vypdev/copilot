import { expect, it, vi } from 'vitest';
import { RecentsCapture } from '../../src/application/recents_capture.ts';
import { VisitDelivery } from '../../src/application/visit_delivery.ts';
import { RECENT_SOURCE } from '../fixtures/recents_capture.ts';
import { collectionHistoryFixture } from '../fixtures/collection_history.ts';
import { writerFact } from '../fixtures/journal_writer.ts';
import { deferred } from '../fixtures/runtime.ts';

it('actual full journal capacity rejects a visit and its delivery reports the missing observation without retrying', async () => {
    const f = collectionHistoryFixture(true); await f.history.refresh();
    const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { entered.resolve(); await release.promise; return native(...args); });
    for (let n = 0; n < 200; n++) expect(f.history.writer.admit('diagnostics', writerFact(), () => true)).not.toBeNull();
    await entered.promise;
    const capture = f.history.recents.capture(RECENT_SOURCE, () => true);
    if (capture.state !== 'ready' || !capture.permit) throw new Error('missing permit');
    const request = vi.fn(async (message: Parameters<VisitDelivery['observe']>[0]['message']) =>
        f.history.recents.observe(RECENT_SOURCE, message.permit, message.sequence, message.destination, () => true));
    const delivery = new VisitDelivery({ valid: () => true, relevant: () => true, request, changed: vi.fn() });
    try {
        delivery.observe({ epoch: capture.epoch!, message: { version: 1, method: 'center.recents.observe', ...RECENT_SOURCE,
            permit: capture.permit, sequence: 1, destination: { route: 'privacy' } } });
        await delivery.flush();
        expect(request).toHaveBeenCalledOnce(); expect(await request.mock.results[0].value).toEqual({ state: 'unavailable' });
        expect(delivery.view).toEqual({ pending: 0, dropped: 1, incomplete: true });
        expect(f.history.writer.state('recents')).toMatchObject({ dropped: 1, issue: 'capacity' });
        expect(f.history.recents.observe(RECENT_SOURCE, capture.permit, 1, { route: 'privacy' }, () => true)).toEqual({ state: 'unavailable' });
        expect(f.history.writer.state('recents').dropped).toBe(1);
        expect(f.documents.has('recents')).toBe(false);
    } finally { delivery.stop(); f.history.stop(); release.resolve(); await f.history.writer.flush(); }
});

it('loss of writer readiness cannot be acknowledged as a recorded destination', async () => {
    const f = collectionHistoryFixture(true); await f.history.refresh();
    const producer = new RecentsCapture({ admission: () => f.history.coordinator.admission('recents'), epoch: () => 0,
        identifier: () => 'b'.repeat(32), admit: (fact, current) => f.history.writer.admit('recents', fact, current) });
    const capture = producer.capture(RECENT_SOURCE, () => true);
    if (capture.state !== 'ready' || !capture.permit) throw new Error('missing permit');
    vi.mocked(f.journals.execute).mockResolvedValueOnce({ state: 'unavailable', effect: 'not-started' }); await f.history.writer.prime('recents');
    expect(f.history.writer.state('recents').epoch).toBeNull();
    expect(producer.observe(RECENT_SOURCE, capture.permit, 1, { route: 'privacy' }, () => true)).toEqual({ state: 'unavailable' });
    expect(f.history.writer.state('recents').issue).toBe('not-ready'); expect(f.documents.has('recents')).toBe(false);
    producer.stop(); f.history.stop();
});
