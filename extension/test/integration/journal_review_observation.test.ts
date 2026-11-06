import { expect, it } from 'vitest';
import type { JournalClearOutcome, JournalClearInspection } from '../../src/domain/journal_clear.ts';
import { journalReviewsFixture, clearPreview, JOURNAL_OWNER } from '../fixtures/journal_reviews.ts';

it('a duplicate clear confirmation reentered from native reservation shares the registered primary promise', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); let duplicate: Promise<JournalClearOutcome> | null = null;
    f.ports.reserve.mockImplementationOnce(() => { duplicate = f.reviews.confirm(preview.operationId, JOURNAL_OWNER); return f.lease; });
    const first = f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(await first).toMatchObject({ state: 'observed-cleared' }); expect(duplicate).toBe(first);
    expect(f.store.execute.mock.calls.filter(([, command]) => command.type === 'clear')).toHaveLength(1);
});
it('inspection and cancellation reentered from reservation observe a running clear rather than an expired or unsubmitted plan', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const observations: (JournalClearOutcome | JournalClearInspection)[] = [];
    f.ports.reserve.mockImplementationOnce(() => { observations.push(f.reviews.inspect(preview.operationId, JOURNAL_OWNER), f.reviews.cancel(preview.operationId, JOURNAL_OWNER)); return f.lease; });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toMatchObject({ state: 'observed-cleared' });
    expect(observations).toEqual([{ state: 'pending' }, { state: 'pending' }]); expect(f.lease.release).toHaveBeenCalledOnce();
});
it('registering the running promise preserves synchronous ownership of the preference queue before later writes can enter', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const pending = f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(f.settings.reserveMutations()).toBeNull(); expect(f.ports.reserve).toHaveBeenCalledOnce();
    expect(await pending).toMatchObject({ state: 'observed-cleared' }); const next = f.settings.reserveMutations(); expect(next).not.toBeNull(); next!.release();
});
