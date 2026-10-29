import { expect, it, vi } from 'vitest';
import { loadSettings } from '../../src/domain/settings.ts';
import type { CollectionRestrictionResult } from '../../src/application/collection_restrictions.ts';
import { pauseCollectionPolicy } from '../../src/application/collection_restrictions.ts';
import { collectionFixture, collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';

const UNKNOWN: CollectionRestrictionResult = { observed: { state: 'unavailable' }, operationId: null,
    fact: { acknowledgement: 'unknown', observation: 'unavailable', policyRevision: null, sourceCurrentAtObservation: true } };
it('a contended primary queue yields an explicit session stop without submitting or deadlocking', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const held = f.repository.reserveMutations()!;
    const result = f.reviews.confirm(preview.operationId, COLLECTION_OWNER); expect(f.coordinator.state('diagnostics').collecting).toBe(false);
    expect(await result).toMatchObject({ reason: 'busy', preference: { state: 'not-attempted' }, policy: { acknowledgement: 'not-attempted' } }); held.release();
    expect(f.port.set).not.toHaveBeenCalled(); expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(0);
});
it('source retirement before a registered stop runs submits neither native policy nor preferences', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    f.ports.changed.mockImplementationOnce(() => { f.reviews.invalidate(); });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'stale', preference: { state: 'not-attempted' }, sourceCurrentAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(0);
});
it('source retirement after durable metadata pause retains it and does not publish an old preference', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => { const result = await execute(...args);
        if (args[1].type === 'set') f.reviews.invalidate(); return result; });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'stale', preference: { state: 'not-attempted' },
        policy: { acknowledgement: 'accepted', observation: 'paused', attributed: true }, sourceCurrentAtObservation: false }); expect(f.port.set).not.toHaveBeenCalled();
});
it('does not queue its own preference operation behind a lease whose cleanup failed to release', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const reserve = f.repository.reserveMutations.bind(f.repository); let actual: ReturnType<typeof reserve> = null;
    vi.spyOn(f.repository, 'reserveMutations').mockImplementationOnce(() => { actual = reserve(); return { current: actual!.current,
        release() { throw new Error('cleanup'); } }; });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'unavailable', preference: { state: 'not-attempted' }, policy: { observation: 'paused' } });
    actual!.release(); expect(f.port.set).not.toHaveBeenCalled();
});
it.each(['future', 'migration'])('preserves an already-off %s preference frame after the independent policy phase', async state => {
    const f = collectionReviewsFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    vi.spyOn(f.repository, 'inspect').mockResolvedValueOnce({ operation: null, rollback: null,
        loaded: state === 'future' ? loadSettings({ schemaVersion: 99 }) : loadSettings({ schemaVersion: 0, compact: true }) });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'preference-unconfirmed', policy: { observation: 'paused' }, observedPreference: null });
    expect(f.port.set).not.toHaveBeenCalled();
});
it('a primary-boundary exception cannot erase the earlier durable policy stop', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    vi.spyOn(f.repository, 'commit').mockRejectedValueOnce(new Error('exceptional-boundary'));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'preference-unconfirmed', preference: { state: 'unknown', acknowledgement: 'unknown' },
        policy: { acknowledgement: 'accepted', observation: 'paused' }, observedPreference: { enabled: true } });
});
it('an unavailable final inspection preserves both confirmed primary and policy effects', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const inspect = f.repository.inspect.bind(f.repository); vi.spyOn(f.repository, 'inspect').mockImplementationOnce(inspect).mockImplementationOnce(inspect)
        .mockRejectedValueOnce(new Error('final-inspection'));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'unavailable', preference: { state: 'committed' }, policy: { observation: 'paused' } });
});
it('staged stops are bounded and cannot replace an existing operation identity', async () => {
    const f = collectionFixture(); expect(f.coordinator.stageStop('bad', 'diagnostics', 0, UNKNOWN)).toBe(false);
    for (let i = 0; i < 16; i++) expect(f.coordinator.stageStop((i + 1).toString(16).padStart(32, '0'), 'diagnostics', 0, UNKNOWN)).toBe(true);
    expect(f.coordinator.stageStop('1'.padStart(32, '0'), 'diagnostics', 0, UNKNOWN)).toBe(false);
    expect(f.coordinator.stageStop('f'.repeat(32), 'diagnostics', 0, UNKNOWN)).toBe(false);
    f.coordinator.clearStagedStop('1'.padStart(32, '0')); expect(f.coordinator.stageStop('f'.repeat(32), 'diagnostics', 0, UNKNOWN)).toBe(true);
});
it.each(['kind', 'revision', 'increasing'] as const)('a staged pause cannot be consumed by a mismatching %s transition', async mismatch => {
    const f = collectionFixture(collectionSettings(mismatch !== 'increasing')); f.values.set('diagnostics', activeCollectionPolicy()); const id = 'f'.repeat(32);
    expect(f.coordinator.stageStop(id, mismatch === 'kind' ? 'recents' : 'diagnostics', mismatch === 'revision' ? 1 : 0, UNKNOWN)).toBe(true);
    const after = collectionSettings(mismatch === 'increasing'); expect((await f.repository.commit(after, 0, id, () => true)).state).toBe('committed');
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
    expect(f.coordinator.takePreparation(id)?.diagnostics?.result.observed).toMatchObject({ state: 'ready', policy: { mode: 'paused' } });
});
it('a saturated staging boundary preserves the submitted pause without repeating it or claiming preference success', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    vi.spyOn(f.coordinator, 'stageStop').mockReturnValueOnce(false);
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'busy', preference: { state: 'not-attempted' }, policy: { observation: 'paused' } });
    expect(f.port.set).not.toHaveBeenCalled(); expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
});
it('a partial preference write can establish off without certifying the full confirmed configuration', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const set = vi.mocked(f.port.set).getMockImplementation()!; vi.mocked(f.port.set).mockImplementationOnce((key, value) => {
        const envelope = value as { current: ReturnType<typeof collectionSettings> }; return set(key, { ...envelope, current: { ...envelope.current, theme: 'dark' } });
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'preference-unconfirmed', preference: { state: 'unknown', observation: 'changed' },
        policy: { observation: 'paused' }, observedPreference: { enabled: false }, preferenceVerifiedAtObservation: false });
});
it('owner retirement after an issued off write preserves both completed effects as historical facts', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const set = vi.mocked(f.port.set).getMockImplementation()!; vi.mocked(f.port.set).mockImplementationOnce(async (...args) => { await set(...args); f.reviews.invalidate(); });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'stale', preference: { state: 'committed', current: false },
        policy: { acknowledgement: 'accepted', observation: 'paused' }, observedPreference: { enabled: false },
        preferenceVerifiedAtObservation: true, sourceCurrentAtObservation: false, admittedAtObservation: false });
});
it('a pre-stop refresh cannot overwrite the subsequently observed durable pause', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    const gate = deferred<ReturnType<typeof loadSettings>>(); f.ports.settings.mockReturnValueOnce(gate.promise);
    const old = f.coordinator.refresh(); await Promise.resolve(); const stamp = f.coordinator.pause('diagnostics');
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 0, () => 'f'.repeat(32), () => true);
    expect(f.coordinator.observeStop('diagnostics', stamp, result)).toBe(true);
    gate.resolve(loadSettings(collectionSettings(true))); await old; expect(f.coordinator.state('diagnostics').policy).toBe('paused');
    const newer = f.coordinator.pause('diagnostics'); expect(f.coordinator.observeStop('diagnostics', stamp, UNKNOWN)).toBe(false);
    expect(f.coordinator.owns('diagnostics', newer)).toBe(true); expect(f.coordinator.state('diagnostics').policy).toBe('paused');
});
