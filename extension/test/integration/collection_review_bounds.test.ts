import { expect, it, vi } from 'vitest';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';

it('retains at most sixteen current pending/running plans and releases capacity after cancellation', async () => {
    const f = collectionReviewsFixture(); const plans = [];
    for (let i = 0; i < 16; i++) plans.push(await collectionPreview(f));
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'busy' });
    f.reviews.cancel(plans[0].operationId, COLLECTION_OWNER); expect((await collectionPreview(f)).state).toBe('preview');
    expect(f.port.set).not.toHaveBeenCalled();
});
it('a new review reclaims stale pending plans before their five-minute expiry', async () => {
    const f = collectionReviewsFixture(); const plans = [];
    for (let i = 0; i < 16; i++) plans.push(await collectionPreview(f));
    f.ports.review.fence.mockReturnValue({ controllerEpoch: 1, credentialEpoch: 2 });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toMatchObject({ state: 'preview' });
    for (const plan of plans) expect(f.reviews.inspect(plan.operationId, COLLECTION_OWNER)).toEqual({ state: 'expired' });
    expect(f.port.set).not.toHaveBeenCalled();
});
it('a delayed preview reclaims stale plans belonging to an older editor at the final capacity check', async () => {
    const f = collectionReviewsFixture(); const another = 'd'.repeat(32); let epoch = 1;
    f.ports.review.fence.mockImplementation(owner => ({ controllerEpoch: owner === COLLECTION_OWNER ? epoch : 1, credentialEpoch: 1 }));
    const inspect = f.repository.inspect.bind(f.repository); const gate = deferred<Awaited<ReturnType<typeof inspect>>>();
    vi.spyOn(f.repository, 'inspect').mockReturnValueOnce(gate.promise);
    const delayed = f.reviews.preview('diagnostics', 'start', another);
    for (let i = 0; i < 16; i++) await collectionPreview(f);
    epoch = 2; gate.resolve(await inspect());
    expect(await delayed).toMatchObject({ state: 'preview' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('a stale running plan retains its capacity until its operation settles', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); const another = 'd'.repeat(32); let epoch = 1;
    f.ports.review.fence.mockImplementation(owner => ({ controllerEpoch: owner === COLLECTION_OWNER ? epoch : 1, credentialEpoch: 1 }));
    const plan = await collectionPreview(f); const inspect = f.repository.inspect.bind(f.repository);
    const entered = deferred<void>(); const release = deferred<void>();
    vi.spyOn(f.repository, 'inspect').mockImplementationOnce(async () => { entered.resolve(); await release.promise; return inspect(); });
    const running = f.reviews.confirm(plan.operationId, COLLECTION_OWNER); await entered.promise;
    try {
        epoch = 2; expect(f.reviews.cancel(plan.operationId, COLLECTION_OWNER)).toEqual({ state: 'stale' });
        for (let i = 0; i < 15; i++) expect(await f.reviews.preview('recents', 'start', another)).toMatchObject({ state: 'preview' });
        expect(await f.reviews.preview('recents', 'start', another)).toEqual({ state: 'busy' });
    } finally { release.resolve(); }
    expect(await running).toMatchObject({ state: 'settled', reason: 'stale' });
    expect(await f.reviews.preview('recents', 'start', another)).toMatchObject({ state: 'preview' });
    expect(f.port.set).not.toHaveBeenCalled();
});
it('rechecks capacity when a delayed seventeenth preview returns after sixteen other plans', async () => {
    const f = collectionReviewsFixture(); const inspect = f.repository.inspect.bind(f.repository); const gate = deferred<Awaited<ReturnType<typeof inspect>>>();
    vi.spyOn(f.repository, 'inspect').mockReturnValueOnce(gate.promise); const delayed = f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER);
    for (let i = 0; i < 16; i++) await collectionPreview(f);
    gate.resolve(await inspect()); expect(await delayed).toEqual({ state: 'busy' });
});
it('keeps only thirty-two completed facts and prunes those after their own replay lifetime', async () => {
    const f = collectionReviewsFixture(); const completed = [];
    for (let i = 0; i < 34; i++) { const plan = await collectionPreview(f, i % 2 ? 'stop' : 'start');
        completed.push({ id: plan.operationId, result: await collectionConfirm(f, plan.operationId) }); }
    expect(await f.reviews.confirm(completed[0].id, COLLECTION_OWNER)).toEqual({ state: 'expired' });
    expect(await f.reviews.confirm(completed[2].id, COLLECTION_OWNER)).toBe(completed[2].result);
    f.advance(300_000); expect(await f.reviews.confirm(completed[33].id, COLLECTION_OWNER)).toEqual({ state: 'expired' });
});
it.each(['invalid', 'same', 'throws', 'current-receipt'])('refuses %s native identities before retaining any effect authority', async state => {
    const f = collectionReviewsFixture();
    if (state === 'invalid') f.ports.review.identifier.mockReturnValue('bad');
    if (state === 'same') f.ports.review.identifier.mockReturnValue('a'.repeat(32));
    if (state === 'throws') f.ports.review.identifier.mockImplementation(() => { throw new Error('entropy'); });
    if (state === 'current-receipt') { f.values.set('diagnostics', activeCollectionPolicy()); f.ports.review.identifier.mockReturnValueOnce('e'.repeat(32)).mockReturnValueOnce('a'.repeat(32)); }
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'unavailable' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('does not reuse a retained public review identity or its private native nonce for another plan', async () => {
    const f = collectionReviewsFixture(); f.ports.review.identifier.mockReturnValueOnce('e'.repeat(32)).mockReturnValueOnce('f'.repeat(32));
    const first = await collectionPreview(f);
    f.ports.review.identifier.mockReturnValueOnce(first.operationId).mockReturnValueOnce('d'.repeat(32));
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'unavailable' });
    f.ports.review.identifier.mockReturnValueOnce('d'.repeat(32)).mockReturnValueOnce('f'.repeat(32));
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'unavailable' });
});
it('an existing preference receipt cannot be reused as a new composite preference operation', async () => {
    const f = collectionReviewsFixture(); const id = 'e'.repeat(32);
    await f.repository.commit((await f.repository.read()).settings, 0, id, () => true);
    f.ports.review.identifier.mockReturnValueOnce(id).mockReturnValueOnce('f'.repeat(32));
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'unavailable' });
});
it('retiring ownership while a preview is read never retains an old source plan', async () => {
    const f = collectionReviewsFixture(); const inspect = f.repository.inspect.bind(f.repository);
    vi.spyOn(f.repository, 'inspect').mockImplementationOnce(async () => { const result = await inspect(); f.reviews.invalidate(); return result; });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'stale' });
});
it('retiring ownership during consent refresh is checked before retaining the review', async () => {
    const f = collectionReviewsFixture(); const read = f.ports.settings.getMockImplementation()!;
    f.ports.settings.mockImplementationOnce(async () => { const result = await read(); f.reviews.invalidate(); return result; });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'stale' });
});
it('a native entropy callback cannot retain a preview after its source is invalidated', async () => {
    const f = collectionReviewsFixture(); f.ports.review.identifier.mockImplementationOnce(() => { f.reviews.invalidate(); return 'e'.repeat(32); });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'stale' });
});
it('a second kind cannot reuse the private native nonce of a currently running activation', async () => {
    const f = collectionReviewsFixture(); f.ports.review.identifier.mockReturnValueOnce('e'.repeat(32)).mockReturnValueOnce('f'.repeat(32));
    const first = await collectionPreview(f); const entered = deferred<void>(); const held = deferred<void>();
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        if (args[1].type === 'set' && args[1].mode === 'active') { entered.resolve(); await held.promise; }
        return execute(...args);
    });
    const pending = f.reviews.confirm(first.operationId, COLLECTION_OWNER); await entered.promise;
    f.ports.review.identifier.mockReturnValueOnce('d'.repeat(32)).mockReturnValueOnce('f'.repeat(32));
    expect(await f.reviews.preview('recents', 'start', COLLECTION_OWNER)).toEqual({ state: 'unavailable' });
    held.resolve(); expect(await pending).toMatchObject({ reason: 'done', admittedAtObservation: true });
});
