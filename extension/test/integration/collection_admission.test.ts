import { expect, it } from 'vitest';
import { IndexedJournalStore } from '../../src/adapters/browser/journal_store.ts';
import { IndexedCollectionPolicyStore } from '../../src/adapters/browser/collection_policy_store.ts';
import { JournalNative } from '../fixtures/journal_native.ts';
import { activeCollectionPolicy, collectionChange } from '../fixtures/collection_policy.ts';
import { append, NOW, saved, submitted } from '../fixtures/local_journal.ts';

const tick = () => Promise.resolve();
function fixture() {
    const native = new JournalNative(); native.data.set('policy:diagnostics', activeCollectionPolicy());
    return { native, journal: new IndexedJournalStore(native.factory), policy: new IndexedCollectionPolicyStore(native.factory) };
}
it('checks policy and journal from the same transaction even when policy responds first', async () => {
    const f = fixture(); const result = f.journal.execute('diagnostics', append(), () => true, 1); f.native.opened(); await tick();
    const transaction = f.native.transactions[0]; expect(transaction.names).toEqual(['diagnostics', 'policy']);
    transaction.readStore('policy'); expect(transaction.puts).toHaveLength(0); transaction.readStore('diagnostics');
    expect(transaction.puts).toHaveLength(1); transaction.complete(); expect((await result).state).toBe('written');
    expect(f.native.data.get('policy:diagnostics')).toEqual(activeCollectionPolicy());
});
it('a repeated history callback cannot substitute a default paused policy before its real response', async () => {
    const f = fixture(); f.native.data.set('diagnostics', saved());
    const result = f.journal.execute('diagnostics', { type: 'clear', now: NOW, epoch: 0, revision: 1 }, () => true, 0); f.native.opened(); await tick();
    const transaction = f.native.transactions[0]; transaction.readStore('diagnostics'); transaction.readStore('diagnostics');
    expect(transaction.puts).toHaveLength(0); transaction.readStore('policy'); transaction.complete();
    expect(await result).toEqual({ state: 'collection-active' }); expect(f.native.data.get('diagnostics')).toEqual(saved());
});
it('queued duplicate native callbacks cannot submit the same journal decision twice', async () => {
    const f = fixture(); const result = f.journal.execute('diagnostics', append(), () => true, 1); f.native.opened(); await tick();
    const transaction = f.native.transactions[0]; transaction.read(); transaction.readStore('policy'); transaction.readStore('diagnostics');
    expect(transaction.puts).toHaveLength(1); transaction.complete(); expect((await result).state).toBe('written');
});
it('a source retired between the two native reads cannot publish a journal entry', async () => {
    const f = fixture(); let current = true; const result = f.journal.execute('diagnostics', append(), () => current, 1); f.native.opened(); await tick();
    const transaction = f.native.transactions[0]; transaction.readStore('diagnostics'); current = false; transaction.readStore('policy'); transaction.complete();
    expect(await result).toEqual({ state: 'stale' }); expect(f.native.data.has('diagnostics')).toBe(false);
});
it('a durable pause committed before a queued old append prevents its capture', async () => {
    const f = fixture(); const paused = f.policy.execute('diagnostics', collectionChange('paused', 1, 'b'.repeat(32)), () => true);
    f.native.opened(); await tick(); const late = f.journal.execute('diagnostics', append(), () => true, 1); f.native.opened(1); await tick();
    f.native.transactions[0].read(); f.native.transactions[0].complete(); expect((await paused).state).toBe('written');
    // Overlapping native scopes serialize in this order; the driver delivers the later read after commit.
    f.native.transactions[1].read(); f.native.transactions[1].complete(); expect(await late).toEqual({ state: 'collection-inactive' });
    expect(f.native.data.has('diagnostics')).toBe(false);
});
it('an already admitted record can observe its completion after durable collection pause', async () => {
    const f = fixture(); f.native.data.set('diagnostics', saved());
    const pause = f.policy.execute('diagnostics', collectionChange('paused', 1, 'b'.repeat(32)), () => true); f.native.opened(); await tick();
    f.native.transactions[0].read(); f.native.transactions[0].complete(); await pause;
    const result = f.journal.execute('diagnostics', { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }, () => true);
    f.native.opened(1); await tick(); f.native.transactions[1].read(); f.native.transactions[1].complete();
    expect((await result).state).toBe('written'); expect(f.native.data.get('diagnostics')).toMatchObject({ entries: [{ fact: submitted }] });
});
it('native clear rejects a stale paused policy revision even when the history revision still matches', async () => {
    const f = fixture(); f.native.data.set('diagnostics', saved()); const pause = f.policy.execute('diagnostics', collectionChange('paused', 1, 'b'.repeat(32)), () => true);
    f.native.opened(); await tick(); f.native.transactions[0].read(); f.native.transactions[0].complete(); await pause;
    const clear = f.journal.execute('diagnostics', { type: 'clear', now: NOW, epoch: 0, revision: 1 }, () => true, 0);
    f.native.opened(1); await tick(); f.native.transactions[1].read(); f.native.transactions[1].complete();
    expect(await clear).toEqual({ state: 'stale' }); expect(f.native.data.get('diagnostics')).toEqual(saved());
});
it.each(['diagnostics', 'policy'])('contains an unreadable %s result without replacing it with an empty successful read', async name => {
    const f = fixture(); const result = f.journal.execute('diagnostics', append(), () => true, 1); f.native.opened(); await tick();
    const transaction = f.native.transactions[0]; const request = transaction.requests.find(item => item.store === name)!.request;
    Object.defineProperty(request, 'result', { get() { throw new Error('private'); } }); request.onsuccess?.call(request, {} as Event);
    expect(transaction.aborted).toBe(true); transaction.rollback(); expect(await result).toEqual({ state: 'unavailable', effect: 'aborted' });
    expect(transaction.puts).toHaveLength(0);
});
it('rejects missing private admission or policy revision before native storage opens', async () => {
    const f = fixture();
    expect(await f.journal.execute('diagnostics', append(), () => true)).toEqual({ state: 'invalid' });
    expect(await f.journal.execute('diagnostics', append(), undefined, 1)).toEqual({ state: 'stale' });
    expect(f.native.opens).toHaveLength(0);
});
it('revalidates the captured command rather than keeping mutable caller authority across native open', async () => {
    const f = fixture(); let reads = 0; const command = { ...append(), get type() { return ++reads <= 4 ? 'append' : 'future'; } };
    expect(await f.journal.execute('diagnostics', command as never, () => true, 1)).toEqual({ state: 'invalid' });
    expect(f.native.opens).toHaveLength(0);
});
