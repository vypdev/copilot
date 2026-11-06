import { expect, it, vi } from 'vitest';
import { ApiCacheReviews } from '../../src/application/api_cache_reviews.ts';
import { apiCacheReviewsFixture, CACHE_OWNER } from '../fixtures/api_cache_reviews.ts';
import { CACHE_SUCCESS } from '../fixtures/cache_scheduler.ts';

it('invalid owner, unavailable authority, clock and identifiers fail before native cache inspection', () => {
    const f = apiCacheReviewsFixture(); expect(f.reviews.preview('invalid')).toEqual({ state: 'denied' }); expect(f.ports.fence).not.toHaveBeenCalled();
    f.source(null); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'denied' });
    f.source({ controllerEpoch: -1, credentialEpoch: 2 }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'denied' });
    f.source({ controllerEpoch: 1, credentialEpoch: 2 }); f.ports.fence.mockImplementationOnce(() => { throw new Error('private authority'); });
    expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'denied' });
    for (const now of [NaN, Number.MAX_SAFE_INTEGER]) { f.clock(now); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'unavailable' }); }
    f.clock(1000); f.ports.now.mockImplementationOnce(() => { throw new Error('private clock'); }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'unavailable' });
    f.ports.identifier.mockReturnValueOnce('invalid'); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'unavailable' });
    f.ports.identifier.mockImplementationOnce(() => { throw new Error('private ID'); }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'unavailable' });
    expect(f.cache.capture).not.toHaveBeenCalled(); expect(f.cache.clear).not.toHaveBeenCalled();
});
it('capture and witness failures cannot publish a usable preview or revive an invalidated preparation', () => {
    const f = apiCacheReviewsFixture(); f.cache.capture.mockImplementationOnce(() => { throw new Error('private cache'); });
    expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'unavailable' });
    f.cache.current.mockImplementationOnce(() => { throw new Error('private witness'); }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'stale' });
    f.cache.capture.mockImplementationOnce(() => { f.source(null); return Object.freeze({}); }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'stale' });
    f.source({ controllerEpoch: 1, credentialEpoch: 2 });
    f.cache.current.mockImplementationOnce(() => { f.reviews.invalidate(); return true; }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'stale' });
    expect(f.cache.clear).not.toHaveBeenCalled();
    const stopped = apiCacheReviewsFixture(); stopped.ports.identifier.mockImplementationOnce(() => { stopped.reviews.stop(); return '1'.padStart(32, '0'); });
    expect(stopped.reviews.preview(CACHE_OWNER)).toEqual({ state: 'stale' }); expect(stopped.cache.capture).not.toHaveBeenCalled();
});
it('lookup refuses malformed, unknown, expired and lost-source plans without a native clear or automatic replacement', () => {
    const f = apiCacheReviewsFixture(); expect(f.reviews.inspect('invalid', CACHE_OWNER)).toEqual({ state: 'invalid' });
    expect(f.reviews.inspect('f'.repeat(32), CACHE_OWNER)).toEqual({ state: 'expired' });
    const review = f.preview(); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'busy' }); f.clock(NaN);
    expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'unavailable' }); f.clock(1000); f.source(null);
    expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'denied' }); f.source({ controllerEpoch: 1, credentialEpoch: 2 });
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'stale' });
    expect(f.cache.clear).not.toHaveBeenCalled(); expect(f.cache.capture).toHaveBeenCalledOnce();
});
it('secondary observation cannot change the native effect, and source loss during submission prevents the first clear', () => {
    const f = apiCacheReviewsFixture(); f.ports.observe.mockImplementationOnce(() => { throw new Error('private observer'); });
    const review = f.preview(); expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' });
    const late = apiCacheReviewsFixture(); late.ports.observe.mockImplementation(() => state => { if (state === 'submitted') late.source(null); });
    const pending = late.preview(); expect(late.reviews.confirm(pending.operationId, CACHE_OWNER)).toEqual({ state: 'stale' }); expect(late.cache.clear).not.toHaveBeenCalled();
    const withdrawn = apiCacheReviewsFixture(); withdrawn.ports.observe.mockImplementation(() => () => { withdrawn.reviews.invalidate(); });
    expect(withdrawn.reviews.preview(CACHE_OWNER)).toEqual({ state: 'stale' }); expect(withdrawn.cache.clear).not.toHaveBeenCalled();
    const failed = apiCacheReviewsFixture(); failed.ports.observe.mockImplementation(() => () => { throw new Error('private notification'); });
    const admitted = failed.preview(); expect(failed.reviews.confirm(admitted.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' });
});
it('a denied final native guard cannot be reported as clearing, while a lost result after real clearing remains unknown', async () => {
    const denied = apiCacheReviewsFixture(); const review = denied.preview(); denied.cache.clear.mockReturnValueOnce(false);
    expect(denied.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'stale' }); expect(denied.observed).toEqual(['reviewed', 'submitted', 'not-applied']);
    const f = apiCacheReviewsFixture(); await f.run(); const pending = f.preview();
    f.cache.clear.mockImplementationOnce((witness, current) => { expect(f.scheduler.clearApiCache(witness, current)).toBe(true); throw new Error('lost completion'); });
    expect(f.reviews.confirm(pending.operationId, CACHE_OWNER)).toEqual({ state: 'unknown' });
    f.advance(10001); expect(await f.run('response', false)).toEqual(CACHE_SUCCESS); expect(f.reader.read).toHaveBeenCalledTimes(2);
    expect(f.reviews.cancel(pending.operationId, CACHE_OWNER)).toEqual({ state: 'unknown' }); expect(f.reviews.confirm(pending.operationId, CACHE_OWNER)).toEqual({ state: 'unknown' });
    expect(f.cache.clear).toHaveBeenCalledOnce(); expect(vi.mocked(f.reader.read).mock.calls[1][3]).toBeUndefined();
});
it('invalidation and worker recreation never replay old plans, and stop performs no subsequent authority query', () => {
    const f = apiCacheReviewsFixture(); const review = f.preview();
    const recreated = new ApiCacheReviews(f.cache, f.ports); expect(recreated.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'expired' });
    f.reviews.invalidate(); expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'expired' }); expect(f.observed).toEqual(['reviewed', 'blocked']);
    const next = f.preview(); f.reviews.stop(); const queries = f.ports.fence.mock.calls.length;
    expect(f.reviews.confirm(next.operationId, CACHE_OWNER)).toEqual({ state: 'denied' }); expect(f.reviews.preview(CACHE_OWNER)).toEqual({ state: 'denied' });
    expect(f.ports.fence).toHaveBeenCalledTimes(queries); expect(f.cache.clear).not.toHaveBeenCalled();
});
it('expiry pruning releases capacity without rewriting cancelled/completed facts or certifying an expired operation', () => {
    const f = apiCacheReviewsFixture(); const cancelled = f.preview(); f.reviews.cancel(cancelled.operationId, CACHE_OWNER); const pending = f.preview();
    f.advanceReview(300000); const fresh = f.preview(); expect(f.observed).toEqual(['reviewed', 'cancelled', 'reviewed', 'blocked', 'reviewed']);
    expect(f.reviews.inspect(cancelled.operationId, CACHE_OWNER)).toEqual({ state: 'expired' }); expect(f.reviews.inspect(pending.operationId, CACHE_OWNER)).toEqual({ state: 'expired' });
    expect(f.reviews.confirm(fresh.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); f.advanceReview(300000);
    expect(f.reviews.inspect(fresh.operationId, CACHE_OWNER)).toEqual({ state: 'expired' }); expect(f.observed.at(-1)).toBe('cleared');
    const next = f.preview(); f.reviews.confirm(next.operationId, CACHE_OWNER); f.reviews.invalidate(); expect(f.observed.at(-1)).toBe('cleared');
});
it('a retired witness is visible to read-only inspection and unavailable authority cannot retire another owner’s review', () => {
    const f = apiCacheReviewsFixture(); const review = f.preview(); f.ports.fence.mockReturnValueOnce(null);
    expect(f.reviews.inspect(review.operationId, 'b'.repeat(32))).toEqual({ state: 'denied' });
    expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'not-submitted' });
    f.source(null); expect(f.reviews.inspect('f'.repeat(32), CACHE_OWNER)).toEqual({ state: 'denied' }); f.source({ controllerEpoch: 1, credentialEpoch: 2 });
    f.scheduler.invalidate(); expect(f.reviews.inspect(review.operationId, CACHE_OWNER)).toEqual({ state: 'stale' }); expect(f.cache.clear).not.toHaveBeenCalled();
});
it('the private observer guard retires permanently on source loss, while absent optional observation grants no fallback authority', () => {
    const f = apiCacheReviewsFixture(); let guard: (() => boolean) | undefined;
    f.ports.observe.mockImplementation((_owner, current) => { guard = current; return vi.fn(); }); const review = f.preview(); expect(guard!()).toBe(true);
    expect(f.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); expect(guard!()).toBe(true);
    f.source(null); expect(guard!()).toBe(false); f.source({ controllerEpoch: 1, credentialEpoch: 2 }); expect(guard!()).toBe(false);
    const absent = apiCacheReviewsFixture(); const reviews = new ApiCacheReviews(absent.cache, { now: absent.ports.now, identifier: absent.ports.identifier, fence: absent.ports.fence });
    const next = reviews.preview(CACHE_OWNER); if (next.state !== 'preview') throw new Error('missing preview');
    expect(reviews.confirm(next.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); expect(absent.observed).toEqual([]);
});
