import { afterEach, expect, it, vi } from 'vitest';
import { historyGatewayFixture } from '../fixtures/history_gateway.ts';
import { collectionReviewsFixture, collectionPreview, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';
import { journalReviewsFixture, clearPreview, JOURNAL_OWNER } from '../fixtures/journal_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';

afterEach(() => { vi.restoreAllMocks(); });
type Preview = { readonly state: string; readonly operationId: string };
it.each(['collection', 'history.clear'] as const)('read-only %s inspection never confirms an unsubmitted retained plan', async family => {
    const f = historyGatewayFixture(); const owner = await f.open();
    const preview = await f.call({ ...owner, method: `center.${family}.preview`, kind: 'diagnostics', ...(family === 'collection' ? { action: 'start' } : {}) }) as Preview;
    expect(preview.state).toBe('preview'); const calls = vi.mocked(f.policies.execute).mock.calls.length + vi.mocked(f.journals.execute).mock.calls.length;
    expect(await f.call({ ...owner, method: `center.${family}.result`, operationId: preview.operationId })).toEqual({ state: 'not-submitted' });
    expect(f.port.set).not.toHaveBeenCalled(); expect(vi.mocked(f.policies.execute).mock.calls.length + vi.mocked(f.journals.execute).mock.calls.length).toBe(calls);
    expect(await f.call({ ...owner, method: `center.${family === 'collection' ? 'history.clear' : 'collection'}.result`, operationId: preview.operationId })).toEqual({ state: 'expired' });
});
it('inspects an in-flight collection without joining its write and later returns exactly its historical phase facts', async () => {
    const f = historyGatewayFixture(); const owner = await f.open();
    const preview = await f.call({ ...owner, method: 'center.collection.preview', kind: 'diagnostics', action: 'start' }) as Preview;
    const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => { if (args[1].type === 'set' && args[1].mode === 'active') { entered.resolve(); await release.promise; } return native(...args); });
    const pending = f.call({ ...owner, method: 'center.collection.confirm', operationId: preview.operationId }); await entered.promise;
    expect(await f.call({ ...owner, method: 'center.collection.result', operationId: preview.operationId })).toEqual({ state: 'pending' });
    expect(f.history.coordinator.state('diagnostics').collecting).toBe(false); release.resolve(); const completed = await pending;
    const policyWrites = vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set').length;
    await f.history.settings.update(value => ({ ...value, density: 'compact' })); await f.history.refresh();
    expect(await f.call({ ...owner, method: 'center.collection.result', operationId: preview.operationId })).toEqual(completed);
    expect(completed).toMatchObject({ state: 'settled', preference: { revision: 1 } });
    expect((await f.history.settings.read())).toMatchObject({ settings: { revision: 2 } });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(policyWrites);
});
it('inspects a pending clear without submitting another transaction or upgrading its eventual acknowledgement', async () => {
    const f = historyGatewayFixture(); const owner = await f.open();
    const preview = await f.call({ ...owner, method: 'center.history.clear.preview', kind: 'recents' }) as Preview;
    const entered = deferred<void>(); const release = deferred<void>(); const native = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { if (args[1].type === 'clear') { entered.resolve(); await release.promise; } return native(...args); });
    const pending = f.call({ ...owner, method: 'center.history.clear.confirm', operationId: preview.operationId }); await entered.promise;
    expect(await f.call({ ...owner, method: 'center.history.clear.result', operationId: preview.operationId })).toEqual({ state: 'pending' });
    release.resolve(); const completed = await pending; const calls = vi.mocked(f.journals.execute).mock.calls.length;
    expect(await f.call({ ...owner, method: 'center.history.clear.result', operationId: preview.operationId })).toEqual(completed);
    expect(completed).toMatchObject({ state: 'observed-cleared', acknowledgement: 'accepted' }); expect(f.journals.execute).toHaveBeenCalledTimes(calls);
    expect(vi.mocked(f.journals.execute).mock.calls.filter(c => c[1].type === 'clear')).toHaveLength(1);
});
it('retained-result reads do not renew a review lifetime or turn an expired ID into a new submission', async () => {
    let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const f = historyGatewayFixture(); const owner = await f.open();
    const preview = await f.call({ ...owner, method: 'center.collection.preview', kind: 'diagnostics', action: 'start' }) as Preview;
    now += 299_999; expect(await f.call({ ...owner, method: 'center.collection.result', operationId: preview.operationId })).toEqual({ state: 'not-submitted' });
    now += 1; expect(await f.call({ ...owner, method: 'center.collection.result', operationId: preview.operationId })).toEqual({ state: 'expired' });
    expect(await f.call({ ...owner, method: 'center.collection.confirm', operationId: preview.operationId })).toEqual({ state: 'expired' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('inspectors retain owner, validation and clock checks in both application families', async () => {
    const collection = collectionReviewsFixture(); const preview = await collectionPreview(collection);
    expect(collection.reviews.inspect(preview.operationId, 'd'.repeat(32))).toEqual({ state: 'denied' });
    expect(collection.reviews.inspect('invalid', COLLECTION_OWNER)).toEqual({ state: 'invalid' });
    collection.ports.review.now.mockReturnValue(NaN); expect(collection.reviews.inspect(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'unavailable' });
    const clear = journalReviewsFixture(); const pending = await clearPreview(clear);
    expect(clear.reviews.inspect(pending.operationId, 'd'.repeat(32))).toEqual({ state: 'denied' });
    clear.takeover(); expect(clear.reviews.inspect(pending.operationId, JOURNAL_OWNER)).toEqual({ state: 'stale' });
});
