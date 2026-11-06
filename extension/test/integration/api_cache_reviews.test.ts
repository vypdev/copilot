import { expect, it } from 'vitest';
import { apiCacheReviewsFixture, CACHE_OWNER } from '../fixtures/api_cache_reviews.ts';
import { CACHE_SUCCESS } from '../fixtures/cache_scheduler.ts';

it('bexh3-cache-C03 preview, inspection and cancellation keep the actual native cache and all durable state unchanged', async () => {
    const f = apiCacheReviewsFixture(); await f.run(); const before = JSON.stringify([...f.values]);
    const review = f.preview(); expect(Object.isFrozen(review)).toBe(true); expect(Object.keys(review)).toEqual(['state', 'operationId', 'expiresAt']);
    expect(review.expiresAt).toBe(301000); expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'not-submitted' });
    expect(f.reviews.cancel(review.operationId, CACHE_OWNER)).toEqual({ state: 'cancelled' });
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cancelled' });
    expect(f.cache.clear).not.toHaveBeenCalled(); expect(JSON.stringify([...f.values])).toBe(before); expect(f.observed).toEqual(['reviewed', 'cancelled']);
    f.advance(10001); expect(await f.run('response', false)).toEqual(CACHE_SUCCESS); expect(f.reader.read).toHaveBeenCalledOnce();
});
it('bexh3-cache-C04 one confirmation clears once and retained inspection/replay cannot clear newly cached responses', async () => {
    const f = apiCacheReviewsFixture(); await f.run(); const review = f.preview(); const before = JSON.stringify([...f.values]);
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' });
    expect(f.cache.clear).toHaveBeenCalledOnce(); expect(JSON.stringify([...f.values])).toBe(before); expect(f.reader.read).toHaveBeenCalledOnce();
    f.advance(10001); await f.run('response', false); expect(f.reader.read).toHaveBeenCalledTimes(2);
    expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' });
    expect(f.reviews.cancel(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' });
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); expect(f.cache.clear).toHaveBeenCalledOnce();
    expect(f.observed).toEqual(['reviewed', 'submitted', 'cleared']);
});
it('bexh3-cache-C05 source movement, foreign owner or a replacement cache cannot reuse a reviewed clear', () => {
    const foreign = apiCacheReviewsFixture(); const valid = foreign.preview();
    expect(foreign.reviews.confirm(valid.operationId, 'b'.repeat(32))).toEqual({ state: 'denied' });
    expect(foreign.reviews.inspect(valid.operationId, CACHE_OWNER)).toEqual({ state: 'not-submitted' });
    for (const cause of ['controller', 'credential', 'cache'] as const) {
        const f = apiCacheReviewsFixture(); const review = f.preview();
        if (cause === 'controller') f.source({ controllerEpoch: 2, credentialEpoch: 2 });
        if (cause === 'credential') f.source({ controllerEpoch: 1, credentialEpoch: 3 });
        if (cause === 'cache') f.scheduler.invalidate();
        expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'stale' });
        f.source({ controllerEpoch: 1, credentialEpoch: 2 });
        expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'stale' });
        expect(f.cache.clear).not.toHaveBeenCalled(); expect(f.observed).toEqual(cause === 'cache' ? ['reviewed', 'blocked'] : ['reviewed']);
    }
});
it.each(['controller', 'credential', 'cache'] as const)('a retired %s context can be replaced by a fresh cache preview', cause => {
    const f = apiCacheReviewsFixture(); const previous = f.preview();
    if (cause === 'controller') f.source({ controllerEpoch: 2, credentialEpoch: 2 });
    if (cause === 'credential') f.source({ controllerEpoch: 1, credentialEpoch: 3 });
    if (cause === 'cache') f.scheduler.invalidate();
    expect(f.reviews.inspect(previous.operationId, CACHE_OWNER)).toEqual({ state: 'stale' });
    const fresh = f.preview(); expect(fresh.operationId).not.toBe(previous.operationId);
    expect(f.reviews.inspect(fresh.operationId, CACHE_OWNER)).toEqual({ state: 'not-submitted' });
    expect(f.reviews.confirm(previous.operationId, CACHE_OWNER)).toEqual({ state: 'stale' });
    expect(f.observed).toEqual(['reviewed', 'blocked', 'reviewed']); expect(f.cache.clear).not.toHaveBeenCalled();
});
it('a witness that retires the entire review owner during replacement blocks only once', () => {
    const f = apiCacheReviewsFixture(); const previous = f.preview();
    f.cache.current.mockImplementationOnce(() => { f.reviews.invalidate(); return false; });
    expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'stale' });
    expect(f.reviews.inspect(previous.operationId, CACHE_OWNER)).toEqual({ state: 'expired' });
    expect(f.observed).toEqual(['reviewed', 'blocked']); expect(f.cache.clear).not.toHaveBeenCalled();
});
it('bexh3-cache-C06 expiry, backward clock, live ID collision and bounded capacity fail closed without evicting a retained result', () => {
    const f = apiCacheReviewsFixture(); const expired = f.preview(); f.advanceReview(300000);
    expect(f.reviews.confirm(expired.operationId, CACHE_OWNER)).toEqual({ state: 'expired' }); expect(f.cache.clear).not.toHaveBeenCalled();
    const previous = f.preview(); f.clock(0); expect(f.reviews.cancel(previous.operationId, CACHE_OWNER)).toEqual({ state: 'expired' });
    f.clock(400000); const completed = f.preview(); f.reviews.cancel(completed.operationId, CACHE_OWNER);
    f.ports.identifier.mockReturnValueOnce(completed.operationId); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'unavailable' });
    for (let i = 0; i < 31; i++) { const next = f.preview(); f.reviews.cancel(next.operationId, CACHE_OWNER); }
    expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'busy' }); expect(f.reviews.inspect(completed.operationId, CACHE_OWNER)).toEqual({ state: 'cancelled' });
    expect(f.cache.clear).not.toHaveBeenCalled();
});
it('bexh3-cache-C07 a thrown native clear remains unknown and inspection or replay never makes a second attempt', () => {
    const f = apiCacheReviewsFixture(); const review = f.preview(); f.cache.clear.mockImplementationOnce(() => { throw new Error('private cache body'); });
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'unknown' });
    expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'unknown' });
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'unknown' }); expect(f.cache.clear).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.observed)).not.toContain('private cache body'); expect(f.observed).toEqual(['reviewed', 'submitted', 'unknown']);
});
it('a synchronous observer cannot confirm a not-yet-returned preview or submit a second clear during notification', () => {
    const f = apiCacheReviewsFixture(); const calls: unknown[] = [];
    f.ports.observe.mockImplementation(() => state => {
        const id = '1'.padStart(32, '0');
        if (state === 'reviewed') { calls.push(f.reviews.preview(CACHE_OWNER)); calls.push(f.reviews.confirm(id, CACHE_OWNER)); calls.push(f.reviews.cancel(id, CACHE_OWNER)); }
        if (state === 'submitted') calls.push(f.reviews.confirm(id, CACHE_OWNER));
    });
    const review = f.preview(); expect(f.cache.clear).not.toHaveBeenCalled(); expect(calls).toEqual([{ state: 'busy' }, { state: 'busy' }, { state: 'busy' }]);
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); expect(calls.at(-1)).toEqual({ state: 'unknown' }); expect(f.cache.clear).toHaveBeenCalledOnce();
});
