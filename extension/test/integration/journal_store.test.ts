import { expect, it } from 'vitest';
import { IndexedJournalStore } from '../../src/adapters/browser/journal_store.ts';
import { JOURNAL_TTL, type JournalResult } from '../../src/domain/local_journal.ts';
import { JournalNative } from '../fixtures/journal_native.ts';
import { append, helper, NOW, saved, submitted } from '../fixtures/local_journal.ts';

const tick = () => Promise.resolve();
function fixture() { const native = new JournalNative(); return { native, store: new IndexedJournalStore(native.factory) }; }
async function started() {
    const fixtureValue = fixture(); const result = fixtureValue.store.execute('diagnostics', append());
    fixtureValue.native.opened(); await tick(); return { ...fixtureValue, result, transaction: fixtureValue.native.transactions[0] };
}
it('opens only one fixed versioned native database and the selected owned store/key', async () => {
    const { native, result, transaction } = await started();
    expect(native.opens.map(({ name, version }) => ({ name, version }))).toEqual([{ name: 'copilot.generated-history.v1', version: 1 }]);
    expect(transaction.name).toBe('diagnostics'); expect(transaction.reads).toEqual(['current']);
    transaction.read(); transaction.complete(); expect((await result).state).toBe('written'); expect(native.closeCount).toBe(1);
});
it('does not report success on request delivery before native transaction completion', async () => {
    const { native, result, transaction } = await started(); let settled = false; void result.then(() => { settled = true; });
    transaction.read(); await tick(); expect(settled).toBe(false); expect(transaction.puts).toHaveLength(1); expect(native.data.size).toBe(0);
    transaction.complete(); expect((await result).state).toBe('written'); expect(native.data.size).toBe(1);
});
it('a native rollback after put reports aborted and preserves the prior data', async () => {
    const { native, result, transaction } = await started(); transaction.read(); transaction.error(); await tick();
    expect(native.data.size).toBe(0); transaction.rollback(); expect(await result).toEqual({ state: 'unavailable', effect: 'aborted' });
    expect(native.closeCount).toBe(1);
});
it('preserves a committed history fact even when closing its connection subsequently throws', async () => {
    const { native, result, transaction } = await started(); transaction.read(); native.throwClose = true; transaction.complete();
    expect((await result).state).toBe('written'); expect(native.data.get('diagnostics')).toMatchObject({ revision: 1 });
});
it('contains an upgrade rollback exception and settles without reporting a submitted history write', async () => {
    const { native, store } = fixture(); native.throwCreate = true; const result = store.execute('diagnostics', append());
    expect(() => native.upgrade({ abort() { throw new Error('private-abort'); } })).not.toThrow();
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' });
});
it('a request error alone cannot certify rollback or commit', async () => {
    const { result, transaction } = await started(); let settled = false; void result.then(() => { settled = true; });
    transaction.error(); await tick(); expect(settled).toBe(false); transaction.rollback(); expect((await result).state).toBe('unavailable');
});
it('rereads the generation within each native transaction and fences a late old completion after clear', async () => {
    const { native, store } = fixture(); native.data.set('diagnostics', saved());
    const clear = store.execute('diagnostics', { type: 'clear', now: NOW, epoch: 0, revision: 1 }); native.opened(); await tick();
    const late = store.execute('diagnostics', { type: 'update', now: NOW, epoch: 0, sequence: 1, fact: submitted }); native.opened(1); await tick();
    const [first, second] = native.transactions; first.read(); first.complete(); expect((await clear).state).toBe('written');
    // Deliver the queued native read only after the preceding transaction commits, as required by IndexedDB.
    second.read(); second.complete(); expect(await late).toEqual({ state: 'stale' }); expect(second.puts).toHaveLength(0);
    expect(native.data.get('diagnostics')).toMatchObject({ epoch: 1, entries: [] });
});
it('an append committed before clear changes the reviewed revision and prevents an unreviewed clear', async () => {
    const { native, store } = fixture(); native.data.set('diagnostics', saved());
    const writing = store.execute('diagnostics', append(helper)); native.opened(); await tick();
    const clear = store.execute('diagnostics', { type: 'clear', now: NOW, epoch: 0, revision: 1 }); native.opened(1); await tick();
    native.transactions[0].read(); native.transactions[0].complete(); await writing;
    native.transactions[1].read(); native.transactions[1].complete(); expect(await clear).toEqual({ state: 'stale' });
    expect(native.data.get('diagnostics')).toMatchObject({ revision: 2, entries: [expect.anything(), expect.anything()] });
});
it('creates exactly the fixed initial stores without permission requests, deletion or network APIs', async () => {
    const { native, store } = fixture(); const result = store.execute('diagnostics', { type: 'read', now: NOW });
    native.upgrade({ abort() { throw new Error('unexpected-abort'); } }); expect(native.created).toEqual(['diagnostics', 'recents']);
    native.opened(); await tick(); native.transactions[0].read(); native.transactions[0].complete();
    expect((await result).state).toBe('ready'); expect(native.data.size).toBe(0);
});
it('aborts unexpected initial layouts rather than deleting and replacing them', async () => {
    const { native, store } = fixture(); native.throwCreate = true; let aborted = false;
    const result = store.execute('diagnostics', { type: 'read', now: NOW }); native.upgrade({ abort() { aborted = true; } });
    expect(aborted).toBe(true); native.failed(); expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' });
});
it('leaves a newer native database unavailable and preserves it without a downgrade attempt', async () => {
    const { native, store } = fixture(); const result = store.execute('diagnostics', append()); native.failed('VersionError');
    expect(await result).toEqual({ state: 'future' }); expect(native.transactions).toHaveLength(0);
});
it('a blocked open reports no submitted history write and closes a late successful connection', async () => {
    const { native, store } = fixture(); const result = store.execute('diagnostics', append()); native.blocked();
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); native.opened();
    expect(native.closeCount).toBe(1); expect(native.transactions).toHaveLength(0); native.failed();
});
it('closes its native connection when another version is requested', async () => {
    const { native, result, transaction } = await started();
    native.database.onversionchange?.call(native.database, {} as IDBVersionChangeEvent); expect(native.closeCount).toBe(1);
    transaction.read(); transaction.rollback(); await result; expect(native.closeCount).toBe(2);
});
it.each(['wrong-version', 'missing-store', 'extra-store', 'foreign-store'] as const)('preserves an unexpected %s layout', async layout => {
    const { native, store } = fixture();
    if (layout === 'wrong-version') native.version = 2;
    else if (layout === 'missing-store') native.names.pop();
    else if (layout === 'extra-store') native.names.push('notes');
    else native.names[1] = 'foreign';
    const result = store.execute('diagnostics', append()); native.opened();
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(native.transactions).toHaveLength(0); expect(native.closeCount).toBe(1);
});
it('contains a native open exception without retaining its private error text', async () => {
    const { native, store } = fixture(); native.throwOpen = true;
    expect(await store.execute('diagnostics', append())).toEqual({ state: 'unavailable', effect: 'not-started' });
});
it('does not open storage for a malformed, future or expanded recording command', async () => {
    const { native, store } = fixture();
    for (const command of [{ ...append(), token: 'private' }, { type: 'future', now: NOW }, { get type() { throw new Error('private'); } }]) {
        const result = await store.execute('diagnostics', command as never); expect(['invalid', 'unavailable']).toContain(result.state);
    }
    expect(await store.execute('credential' as never, append())).toEqual({ state: 'invalid' }); expect(native.opens).toHaveLength(0);
});
it('snapshots the command before native open so a mutable caller cannot replace its safe admitted fact', async () => {
    const { native, store } = fixture(); const command = { ...append(), fact: { ...helper } };
    const result = store.execute('diagnostics', command); Object.assign(command.fact, { code: 'private-error' }); command.epoch = 8;
    native.opened(); await tick(); native.transactions[0].read(); native.transactions[0].complete();
    expect((await result).state).toBe('written'); expect(native.data.get('diagnostics')).toMatchObject({ entries: [{ fact: helper }] });
});
it('contains a transaction creation error and still closes the opened connection', async () => {
    const { native, store } = fixture(); native.throwTransaction = true; const result = store.execute('diagnostics', append()); native.opened();
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(native.closeCount).toBe(1);
});
it.each(['object-store', 'get', 'put'] as const)('waits for rollback after a synchronous native %s exception', async reason => {
    const { native, store } = fixture();
    if (reason === 'object-store') native.throwObjectStore = true; else if (reason === 'get') native.throwGet = true; else native.throwPut = true;
    const result = store.execute('diagnostics', append()); native.opened(); await tick(); const transaction = native.transactions[0];
    if (reason === 'put') transaction.read(); expect(transaction.aborted).toBe(true);
    transaction.rollback(); expect(await result).toEqual({ state: 'unavailable', effect: 'aborted' }); expect(native.data.size).toBe(0);
});
it('reports unknown rather than claiming cancellation if native abort itself cannot establish rollback', async () => {
    const { native, store } = fixture(); native.throwGet = true; native.throwAbort = true;
    const result = store.execute('diagnostics', append()); native.opened(); expect(await result).toEqual({ state: 'unavailable', effect: 'unknown' });
    expect(native.closeCount).toBe(1);
});
it('does not report an empty successful read if a native transaction somehow completes without its read response', async () => {
    const { transaction, result } = await started(); transaction.complete(); expect(await result).toEqual({ state: 'unavailable', effect: 'unknown' });
});
it('preserves future or corrupt stored data without a put, including for a clear request', async () => {
    for (const raw of [{ schemaVersion: 2, private: 'preserve' }, { schemaVersion: 1, corrupt: 'preserve' }]) {
        const { native, store } = fixture(); native.data.set('diagnostics', raw);
        const result = store.execute('diagnostics', { type: 'clear', now: NOW, epoch: 0, revision: 0 }); native.opened(); await tick();
        const transaction = native.transactions[0]; transaction.read(); transaction.complete();
        expect(['future', 'corrupt']).toContain((await result).state); expect(transaction.puts).toHaveLength(0); expect(native.data.get('diagnostics')).toEqual(raw);
    }
});
it('expires generated data transactionally while leaving preferences, notes and protected session scope untouched', async () => {
    const { native, store } = fixture(); native.data.set('diagnostics', saved()); native.data.set('recents', { untouched: true });
    const result = store.execute('diagnostics', { type: 'read', now: NOW + JOURNAL_TTL }); native.opened(); await tick();
    native.transactions[0].read(); native.transactions[0].complete(); expect((await result as Extract<JournalResult, { snapshot: unknown }>).snapshot.entries).toEqual([]);
    expect(native.data.get('recents')).toEqual({ untouched: true }); expect(native.transactions.map(transaction => transaction.name)).toEqual(['diagnostics']);
});
