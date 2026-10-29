import { expect, it, vi } from 'vitest';
import { loadSettings } from '../../src/domain/settings.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';

it('rejects invalid actions/kinds and caller IDs without any native effect', async () => {
    const f = collectionReviewsFixture(); expect(await f.reviews.preview('other' as never, 'start', COLLECTION_OWNER)).toEqual({ state: 'invalid' });
    expect(await f.reviews.preview('diagnostics', 'delete' as never, COLLECTION_OWNER)).toEqual({ state: 'invalid' });
    expect(await f.reviews.confirm('bad', COLLECTION_OWNER)).toEqual({ state: 'invalid' }); expect(f.reviews.cancel('a'.repeat(32), 'bad')).toEqual({ state: 'invalid' });
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.policies.execute).not.toHaveBeenCalled();
});
it.each(['observer', 'throws', 'invalid'])('does not grant a review to a %s fence', async state => {
    const f = collectionReviewsFixture();
    if (state === 'observer') f.ports.review.fence.mockReturnValue(null);
    if (state === 'throws') f.ports.review.fence.mockImplementation(() => { throw new Error('native'); });
    if (state === 'invalid') f.ports.review.fence.mockReturnValue({ controllerEpoch: -1, credentialEpoch: 1 });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'denied' });
    expect(await f.reviews.preview('diagnostics', 'start', 'bad')).toEqual({ state: 'denied' });
});
it.each(['invalid', 'throws', 'overflow'])('does not create a retained lifetime when clock is %s', async state => {
    const f = collectionReviewsFixture();
    if (state === 'throws') f.ports.review.now.mockImplementation(() => { throw new Error('clock'); });
    else f.ports.review.now.mockReturnValue(state === 'overflow' ? Number.MAX_SAFE_INTEGER : NaN);
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'unavailable' });
    expect(await f.reviews.confirm('a'.repeat(32), COLLECTION_OWNER)).toEqual({ state: state === 'overflow' ? 'expired' : 'unavailable' });
});
it.each(['forward', 'backward'])('expires an unsubmitted plan when time moves %s outside its retained lifetime', async direction => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); f.advance(direction === 'forward' ? 300_000 : -1);
    expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'expired' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('an editor or credential epoch move retires a retained plan', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); f.ports.review.fence.mockReturnValue({ controllerEpoch: 2, credentialEpoch: 1 });
    expect(await f.reviews.confirm(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'stale' });
    expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'stale' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('a confirmed cancel removes only an unsubmitted retained plan', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f);
    expect(f.reviews.cancel(preview.operationId, 'd'.repeat(32))).toEqual({ state: 'denied' });
    expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'cancelled' });
    expect(await f.reviews.confirm(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'expired' }); expect(f.port.set).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt', 'migrated', 'unavailable'])('does not plan increases from %s preferences', async state => {
    const f = collectionReviewsFixture();
    if (state === 'unavailable') vi.spyOn(f.repository, 'inspect').mockRejectedValueOnce(new Error('native'));
    if (state !== 'unavailable') {
        const value = state === 'future' ? { schemaVersion: 99 } : state === 'migrated' ? { schemaVersion: 0, compact: true } : { broken: true };
        vi.mocked(f.port.get).mockResolvedValue(value);
    }
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: state === 'migrated' ? 'migration-required' : state === 'unavailable' ? 'unavailable' : state });
});
it('a pause is never silently released by an activation preview, while a stop remains allowed', async () => {
    const f = collectionReviewsFixture({ ...collectionSettings(true), paused: true });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'globally-paused' });
    const stop = await collectionPreview(f, 'stop'); expect((await collectionConfirm(f, stop.operationId)).observedPreference?.enabled).toBe(false);
});
it.each(['future', 'corrupt', 'unavailable'] as const)('does not plan a start under %s policy', async state => {
    const f = collectionReviewsFixture();
    vi.mocked(f.policies.execute).mockResolvedValue(state === 'unavailable' ? { state, effect: 'not-started' } : { state });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state });
});
it('preserves an uncertain global stop instead of releasing both kinds through a single activation', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    vi.mocked(f.port.set).mockRejectedValueOnce(new Error('native')); await f.repository.commit({ ...collectionSettings(true), paused: true }, 0, 'e'.repeat(32), () => true);
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'pause-unconfirmed' });
    const stop = await collectionPreview(f, 'stop'); expect((await collectionConfirm(f, stop.operationId)).observedPreference?.enabled).toBe(false);
});
it('a busy writer postpones activation but not the independent preference recovery controls', async () => {
    const f = collectionReviewsFixture(); f.ports.writerIdle.mockReturnValue(false);
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'busy' });
});
it('does not retain a preview against a different canonical preference revision', async () => {
    const f = collectionReviewsFixture(); f.ports.settings.mockResolvedValue(loadSettings(collectionSettings(false, false, 1)));
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'conflict' });
});
it('already healthy active consent and already-off paused consent create no invented operations', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy());
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'unchanged' });
    expect(await f.reviews.preview('recents', 'stop', COLLECTION_OWNER)).toEqual({ state: 'unchanged' });
    expect(f.port.set).not.toHaveBeenCalled();
});
it.each([true, false])('rejects exhausted activation counters with saved opt-in %s before publication', async optedIn => {
    const f = collectionReviewsFixture(collectionSettings(optedIn)); const active = activeCollectionPolicy(); const revision = Number.MAX_SAFE_INTEGER - (optedIn ? 1 : 2);
    f.values.set('diagnostics', { ...active, revision, receipt: { ...active.receipt!, beforeRevision: revision - 1 } });
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'exhausted' }); expect(f.port.set).not.toHaveBeenCalled();
});
it('does not preview an opt-in that its exhausted preference counter cannot publish', async () => {
    const f = collectionReviewsFixture(collectionSettings(false, false, Number.MAX_SAFE_INTEGER));
    expect(await f.reviews.preview('diagnostics', 'start', COLLECTION_OWNER)).toEqual({ state: 'exhausted' }); expect(f.port.set).not.toHaveBeenCalled();
});
