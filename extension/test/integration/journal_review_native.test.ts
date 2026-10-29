import { expect, it } from 'vitest';
import { IndexedJournalStore } from '../../src/adapters/browser/journal_store.ts';
import { JournalReviews } from '../../src/application/journal_reviews.ts';
import { JournalNative } from '../fixtures/journal_native.ts';
import { JOURNAL_OWNER, journalReviewsFixture } from '../fixtures/journal_reviews.ts';
import { saved } from '../fixtures/local_journal.ts';

async function drive<T>(native: JournalNative, result: Promise<T>): Promise<T> {
    const opened = new Set<number>(); const handled = new Set<number>(); let settled = false;
    void result.then(() => { settled = true; }, () => { settled = true; });
    for (let turn = 0; turn < 100 && !settled; turn++) {
        native.opens.forEach((_, index) => { if (!opened.has(index)) { opened.add(index); native.opened(index); } });
        await Promise.resolve();
        native.transactions.forEach((transaction, index) => { if (!handled.has(index)) { handled.add(index); transaction.read(); transaction.complete(); } });
        await Promise.resolve();
    }
    if (!settled) throw new Error('native-contract-driver-budget');
    return result;
}
function fixture() {
    const f = journalReviewsFixture(); const native = new JournalNative(); native.data.set('diagnostics', saved());
    const reviews = new JournalReviews(new IndexedJournalStore(native.factory), f.settings, f.ports);
    return { ...f, native, reviews };
}
it('executes the actual reviewed use case through native request/commit events and an independent canonical read', async () => {
    const f = fixture(); const preview = await drive(f.native, f.reviews.preview('diagnostics', JOURNAL_OWNER));
    if (preview.state !== 'preview') throw new Error('no-preview');
    const result = await drive(f.native, f.reviews.confirm(preview.operationId, JOURNAL_OWNER));
    expect(result).toMatchObject({ state: 'observed-cleared', acknowledgement: 'accepted', sourceCurrentAtObservation: true });
    expect(f.native.transactions.map(transaction => transaction.puts.length)).toEqual([0, 1, 0]);
    expect(f.native.data.get('diagnostics')).toMatchObject({ epoch: 1, revision: 2, entries: [] });
    expect(f.lease.release).toHaveBeenCalledTimes(1);
});
it('carries the use-case source fence into the native request callback after the async database open', async () => {
    const f = fixture(); const preview = await drive(f.native, f.reviews.preview('diagnostics', JOURNAL_OWNER));
    if (preview.state !== 'preview') throw new Error('no-preview');
    const result = f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    for (let turn = 0; turn < 20 && f.native.opens.length < 2; turn++) await Promise.resolve();
    expect(f.native.opens).toHaveLength(2); f.native.opened(1); await Promise.resolve();
    f.takeover(); const transaction = f.native.transactions[1]; transaction.read(); transaction.complete();
    expect(await result).toEqual({ state: 'stale' }); expect(transaction.puts).toHaveLength(0);
    expect(f.native.data.get('diagnostics')).toEqual(saved()); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
