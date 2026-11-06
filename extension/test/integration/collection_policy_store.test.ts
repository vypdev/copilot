import { expect, it } from 'vitest';
import { IndexedCollectionPolicyStore } from '../../src/adapters/browser/collection_policy_store.ts';
import { JournalNative } from '../fixtures/journal_native.ts';
import { activeCollectionPolicy, collectionChange } from '../fixtures/collection_policy.ts';

const tick = () => Promise.resolve();
function fixture() { const native = new JournalNative(); return { native, store: new IndexedCollectionPolicyStore(native.factory) }; }
async function started() {
    const f = fixture(); const result = f.store.execute('diagnostics', collectionChange(), () => true); f.native.opened(); await tick();
    return { ...f, result, transaction: f.native.transactions[0] };
}
it.each(['diagnostics', 'recents'] as const)('uses only the fixed policy store and the owned %s key', async kind => {
    const { native, store } = fixture(); const result = store.execute(kind, collectionChange(), () => true); native.opened(); await tick();
    const transaction = native.transactions[0]; expect(transaction.name).toBe('policy'); expect(transaction.reads).toEqual([kind]);
    transaction.read(); transaction.complete(); expect((await result).state).toBe('written');
    expect(native.data.get(`policy:${kind}`)).toEqual(activeCollectionPolicy(kind)); expect(native.closeCount).toBe(1);
});
it('reads missing policy as paused without persisting fabricated consent', async () => {
    const { native, store } = fixture(); const result = store.execute('diagnostics', { type: 'read' }); native.opened(); await tick();
    const transaction = native.transactions[0]; transaction.read(); transaction.complete();
    expect(await result).toMatchObject({ state: 'ready', policy: { revision: 0, mode: 'paused' } }); expect(transaction.puts).toEqual([]);
});
it('cannot claim policy commit when only its native request succeeded', async () => {
    const { native, result, transaction } = await started(); let settled = false; void result.then(() => { settled = true; });
    transaction.read(); await tick(); expect(settled).toBe(false); expect(native.data.size).toBe(0);
    transaction.complete(); expect((await result).state).toBe('written');
});
it('contains bubbled errors and waits for native rollback before reporting aborted', async () => {
    const { result, transaction, native } = await started(); let settled = false; void result.then(() => { settled = true; });
    transaction.read(); transaction.error(); await tick(); expect(settled).toBe(false); transaction.rollback();
    expect(await result).toEqual({ state: 'unavailable', effect: 'aborted' }); expect(native.data.size).toBe(0);
});
it('requires a private active source guard for every set and contains false/throwing guards', async () => {
    const { native, store } = fixture();
    expect(await store.execute('diagnostics', collectionChange())).toEqual({ state: 'stale' });
    expect(await store.execute('diagnostics', collectionChange(), () => false)).toEqual({ state: 'stale' });
    expect(await store.execute('diagnostics', collectionChange(), () => { throw new Error('private'); })).toEqual({ state: 'stale' });
    expect(native.opens).toHaveLength(0);
});
it('rechecks the source after native open and before deciding the write', async () => {
    for (const stage of ['open', 'request'] as const) {
        const { native, store } = fixture(); let current = true; const result = store.execute('diagnostics', collectionChange(), () => current);
        if (stage === 'open') current = false; native.opened(); await tick();
        if (stage === 'request') { current = false; native.transactions[0].read(); native.transactions[0].complete(); }
        expect(await result).toEqual({ state: 'stale' }); expect(native.data.size).toBe(0);
    }
});
it('captures the exact admitted command before asynchronous native work', async () => {
    const { native, store } = fixture(); const command = collectionChange(); const result = store.execute('diagnostics', command, () => true);
    Object.assign(command, { mode: 'paused', expectedRevision: 99 }); native.opened(); await tick(); native.transactions[0].read(); native.transactions[0].complete();
    expect((await result).state).toBe('written'); expect(native.data.get('policy:diagnostics')).toEqual(activeCollectionPolicy());
});
it('rejects malformed scope/extra data and contains native open failures without copying private errors', async () => {
    const { native, store } = fixture();
    expect(await store.execute('notes' as never, { type: 'read' })).toEqual({ state: 'invalid' });
    expect(await store.execute('diagnostics', { ...collectionChange(), token: 'private' } as never)).toEqual({ state: 'invalid' });
    expect(native.opens).toHaveLength(0); native.throwOpen = true;
    expect(await store.execute('diagnostics', { type: 'read' })).toEqual({ state: 'unavailable', effect: 'not-started' });
});
it('never uses a mutable command type to bypass the private write guard', async () => {
    const { native, store } = fixture(); let reads = 0;
    const command = { ...collectionChange(), get type() { return ++reads <= 2 ? 'set' : 'future'; } };
    expect(await store.execute('diagnostics', command as never, () => true)).toEqual({ state: 'invalid' }); expect(native.opens).toHaveLength(0);
});
it.each(['object-store', 'get', 'put'] as const)('contains synchronous native %s failure and waits for rollback', async reason => {
    const { native, store } = fixture();
    if (reason === 'object-store') native.throwObjectStore = true; else if (reason === 'get') native.throwGet = true; else native.throwPut = true;
    const result = store.execute('diagnostics', collectionChange(), () => true); native.opened(); await tick(); const transaction = native.transactions[0];
    if (reason === 'put') transaction.read(); transaction.rollback();
    expect(await result).toEqual({ state: 'unavailable', effect: 'aborted' }); expect(native.data.size).toBe(0);
});
it('returns unknown if native abort itself cannot establish rollback', async () => {
    const { native, store } = fixture(); native.throwGet = true; native.throwAbort = true;
    const result = store.execute('diagnostics', collectionChange(), () => true); native.opened();
    expect(await result).toEqual({ state: 'unavailable', effect: 'unknown' });
});
it('contains a transaction creation failure and closes its connection', async () => {
    const { native, store } = fixture(); native.throwTransaction = true;
    const result = store.execute('diagnostics', { type: 'read' }); native.opened();
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(native.closeCount).toBe(1);
});
it('does not claim a policy observation when a transaction completes without delivering its read', async () => {
    const { result, transaction } = await started(); transaction.complete(); expect(await result).toEqual({ state: 'unavailable', effect: 'unknown' });
});
it('preserves the native committed policy fact even if connection cleanup subsequently throws', async () => {
    const { result, transaction, native } = await started(); transaction.read(); native.throwClose = true; transaction.complete();
    expect((await result).state).toBe('written');
});
it('replays the exact durable receipt without another policy put', async () => {
    const { native, store } = fixture(); native.data.set('policy:diagnostics', activeCollectionPolicy());
    const result = store.execute('diagnostics', collectionChange(), () => true); native.opened(); await tick();
    native.transactions[0].read(); native.transactions[0].complete(); expect((await result).state).toBe('replayed'); expect(native.transactions[0].puts).toHaveLength(0);
});
it('preserves future policy and a newer native database without setting a fallback', async () => {
    const { native, store } = fixture(); const future = { schemaVersion: 3, private: 'preserve' }; native.data.set('policy:diagnostics', future);
    const result = store.execute('diagnostics', collectionChange(), () => true); native.opened(); await tick();
    native.transactions[0].read(); native.transactions[0].complete(); expect(await result).toEqual({ state: 'future' }); expect(native.data.get('policy:diagnostics')).toEqual(future);
    const read = store.execute('diagnostics', { type: 'read' }); native.failed('VersionError', 1); expect(await read).toEqual({ state: 'future' });
});
