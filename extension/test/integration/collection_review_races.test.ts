import { expect, it, vi } from 'vitest';
import { SettingsRepository } from '../../src/application/settings_repository.ts';
import { CollectionReviews } from '../../src/application/collection_reviews.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';

it('duplicate confirmations share one real submission and in-flight cancel never claims an abort', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const gate = deferred<void>(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementationOnce(async (...args) => { await gate.promise; return set(...args); });
    const first = f.reviews.confirm(preview.operationId, COLLECTION_OWNER); const second = f.reviews.confirm(preview.operationId, COLLECTION_OWNER);
    expect(first).toBe(second); expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'pending' });
    expect(await f.reviews.confirm(preview.operationId, 'd'.repeat(32))).toEqual({ state: 'denied' }); gate.resolve(); await first;
    expect(f.port.set).toHaveBeenCalledTimes(1); expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
});
it('a synchronous stop notification sees an already registered running operation', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    f.ports.changed.mockImplementationOnce(() => { expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'pending' }); });
    expect((await collectionConfirm(f, preview.operationId)).reason).toBe('done');
});
it('a later stop during the opt-in preflight cannot be absorbed into the old activation witness', async () => {
    const f = collectionReviewsFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f);
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const result = await execute(...args); if (args[1].type === 'set' && args[1].mode === 'paused') f.coordinator.pause('diagnostics'); return result;
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'changed', preference: { state: 'committed' },
        policy: { observation: 'paused', attributed: true }, admittedAtObservation: false });
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics').collecting).toBe(false);
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set' && c[1].mode === 'active')).toHaveLength(0);
});
it('a newly accepted active policy cannot release a newer process stop', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const result = await execute(...args); if (args[1].type === 'set' && args[1].mode === 'active') f.coordinator.pause('diagnostics'); return result;
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ policy: { acknowledgement: 'accepted', observation: 'active', attributed: true }, admittedAtObservation: false });
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics')).toMatchObject({ policy: 'active', sessionBlocked: true, collecting: false });
});
it('retains a first-phase commit after editing ownership is retired and never performs the second phase', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementationOnce(async (...args) => { await set(...args); f.reviews.invalidate(); });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'stale', preference: { state: 'committed', current: false },
        admittedAtObservation: false, sourceCurrentAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set' && c[1].mode === 'active')).toHaveLength(0);
});
it('retains the old admission fact on replay but neither reactivates nor relabels it as current collection', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const first = await collectionConfirm(f, preview.operationId);
    f.coordinator.pause('diagnostics'); const calls = vi.mocked(f.policies.execute).mock.calls.length;
    expect(await collectionConfirm(f, preview.operationId)).toBe(first); expect(f.reviews.cancel(preview.operationId, COLLECTION_OWNER)).toBe(first);
    expect(f.policies.execute).toHaveBeenCalledTimes(calls); expect(first.admittedAtObservation).toBe(true); expect(f.coordinator.state('diagnostics').collecting).toBe(false);
});
it('a queue competitor after saved opt-in yields a partial result without recursively acquiring the preference queue', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const set = vi.mocked(f.port.set).getMockImplementation()!;
    let competitor: Promise<unknown> | undefined;
    vi.mocked(f.port.set).mockImplementationOnce(async (...args) => { await set(...args); competitor = f.repository.update(s => ({ ...s, theme: 'dark' })); });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'busy', preference: { state: 'committed' }, admittedAtObservation: false });
    await competitor; await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics').collecting).toBe(false);
});
it('missing production preference-preflight composition cannot silently grant collection', async () => {
    const f = collectionReviewsFixture(); const uncoordinated = new SettingsRepository(f.port);
    const reviews = new CollectionReviews(uncoordinated, f.coordinator, f.policies, f.ports.review);
    const preview = await reviews.preview('diagnostics', 'start', COLLECTION_OWNER); if (preview.state !== 'preview') throw new Error(preview.state);
    expect(await reviews.confirm(preview.operationId, COLLECTION_OWNER)).toMatchObject({ reason: 'policy-unconfirmed',
        preference: { state: 'committed' }, admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(0);
});
it('a concurrent policy revision move cannot turn saved opt-in into authority to undo another stop', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f);
    f.values.set('diagnostics', activeCollectionPolicy());
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'policy-unconfirmed', preference: { state: 'committed' }, admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set').map(c => c[1])).toMatchObject([{ mode: 'paused' }]);
});
it('an opt-out review is not blocked by a busy secondary writer', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); f.ports.writerIdle.mockReturnValue(false);
    const preview = await collectionPreview(f, 'stop'); expect((await collectionConfirm(f, preview.operationId)).observedPreference?.enabled).toBe(false);
});
