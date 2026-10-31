import { expect, it } from 'vitest';
import { currentOperationsFixture, CURRENT_OWNER, CURRENT_TARGET } from '../fixtures/current_operations.ts';
import { apiCacheReviewsFixture } from '../fixtures/api_cache_reviews.ts';

it('actual cache clearing has an independent closed current fact and source loss cannot rewrite proved completion', async () => {
    const native = apiCacheReviewsFixture(); const f = currentOperationsFixture();
    native.ports.observe.mockImplementation((owner, current) => f.operations.reviewApiCache(owner, current)!);
    await native.run(); const review = native.preview();
    expect(f.read()).toMatchObject({ family: 'cache', stage: 'reviewed', target: { location: { route: 'privacy' }, label: null }, retention: 'untracked' });
    expect(f.ports.admit).toHaveBeenCalledWith({ kind: 'cache-operation', action: 'clear-api-cache', state: 'reviewed' }, expect.any(Function));
    expect(native.reviews.confirm(review.operationId, CURRENT_OWNER)).toEqual({ state: 'cleared' });
    expect(f.read()).toMatchObject({ family: 'cache', stage: 'cleared', fact: { kind: 'cache-operation', action: 'clear-api-cache', state: 'cleared' }, sourceCurrent: true });
    native.source(null); expect(f.read()).toMatchObject({ stage: 'cleared', target: null, sourceCurrent: false });
    native.source({ controllerEpoch: 1, credentialEpoch: 2 }); expect(f.read()).toMatchObject({ stage: 'cleared', target: null, sourceCurrent: false });
});
it('cache metadata never fabricates submission and an older completion advances only its original optional ticket', () => {
    const f = currentOperationsFixture(); f.retaining(true); const trace = f.operations.reviewApiCache(CURRENT_OWNER, f.current)!;
    const old = f.ports.admit.mock.results[0].value; trace('reviewed'); trace('cleared'); expect(f.read().stage).toBe('reviewed'); expect(f.ports.update).not.toHaveBeenCalled();
    f.review(); trace('submitted'); trace('cleared'); expect(f.ports.update.mock.lastCall![0]).toBe(old);
    expect(f.read()).toMatchObject({ family: 'settings', stage: 'reviewed', target: CURRENT_TARGET });
    const before = f.ports.update.mock.calls.length; trace('unknown'); expect(f.ports.update).toHaveBeenCalledTimes(before);
    f.operations.stop(); trace('cleared'); expect(f.ports.update).toHaveBeenCalledTimes(before);
});
it('invalid source or stopped metadata composition cannot create a current cache fact or history ticket', () => {
    const f = currentOperationsFixture(); expect(f.operations.reviewApiCache('invalid', f.current)).toBeNull();
    f.current.mockReturnValue(false); expect(f.operations.reviewApiCache(CURRENT_OWNER, f.current)).toBeNull();
    f.current.mockReturnValue(true); const trace = f.operations.reviewApiCache(CURRENT_OWNER, f.current)!; f.operations.stop(); trace('submitted');
    expect(f.operations.reviewApiCache(CURRENT_OWNER, f.current)).toBeNull(); expect(f.ports.update).not.toHaveBeenCalled();
});
