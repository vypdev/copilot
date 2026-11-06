import { expect, it, vi } from 'vitest';
import { loadSettings } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { executeCollectionPlan } from '../../src/application/collection_effects.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';

it('a still-active policy after failed opt-in preparation prevents both preference publication and activation', async () => {
    const f = collectionReviewsFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f);
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' ? Promise.resolve({ state: 'unavailable', effect: 'unknown' }) : execute(...args));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'policy-unconfirmed', preference: { state: 'unavailable' },
        policy: { observation: 'active' }, admittedAtObservation: false }); expect(f.port.set).not.toHaveBeenCalled();
});
it('an exceptional preference boundary retains unknown acknowledgement rather than claiming no effect', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); vi.spyOn(f.repository, 'commit').mockRejectedValueOnce(new Error('exceptional-boundary'));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ preference: { state: 'unknown', acknowledgement: 'unknown' }, admittedAtObservation: false });
});
it('source retirement while queued reports the retired source instead of blaming an unattempted policy phase', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const held = f.repository.reserveMutations()!;
    const result = f.reviews.confirm(preview.operationId, COLLECTION_OWNER); f.reviews.invalidate(); held.release();
    expect(await result).toMatchObject({ reason: 'stale', preference: { state: 'stale' }, sourceCurrentAtObservation: false, admittedAtObservation: false });
    expect(f.port.set).not.toHaveBeenCalled();
});
it.each(['future', 'migration'])('a phase-boundary %s preference is preserved without policy activation', async state => {
    const f = collectionReviewsFixture(collectionSettings(true)); const preview = await collectionPreview(f);
    vi.spyOn(f.repository, 'inspect').mockResolvedValueOnce({ operation: null, rollback: null,
        loaded: state === 'future' ? loadSettings({ schemaVersion: 99 }) : loadSettings({ schemaVersion: 0, compact: true }) });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'preference-unconfirmed', admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(0);
});
it('a preference reservation retired during canonical inspection cannot submit the policy effect', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); const preview = await collectionPreview(f); const reserve = f.repository.reserveMutations.bind(f.repository);
    let held: ReturnType<typeof reserve> = null; vi.spyOn(f.repository, 'reserveMutations').mockImplementation(() => { held = reserve(); return held; });
    const inspect = f.repository.inspect.bind(f.repository); vi.spyOn(f.repository, 'inspect').mockImplementationOnce(async () => { const read = await inspect(); held!.release(); return read; });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'stale', admittedAtObservation: false });
});
it('a newly observed global pause prevents activation even when opt-in and its revision still match', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); const preview = await collectionPreview(f);
    vi.spyOn(f.repository, 'inspect').mockResolvedValueOnce({ operation: null, rollback: null, loaded: loadSettings({ ...collectionSettings(true), paused: true }) });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'changed', admittedAtObservation: false });
});
it('source retirement during the final canonical consent refresh preserves intent and stops submission', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); const preview = await collectionPreview(f); const read = f.ports.settings.getMockImplementation()!;
    f.ports.settings.mockImplementationOnce(async () => { const value = await read(); f.reviews.invalidate(); return value; });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'stale', preference: { state: 'already' }, admittedAtObservation: false });
});
it.each(['invalid', 'overflow'])('a late %s clock cannot erase submitted facts or create a reusable completed authority', async state => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const value = await execute(...args);
        if (args[1].type === 'set' && args[1].mode === 'active') f.ports.review.now.mockReturnValue(state === 'overflow' ? Number.MAX_SAFE_INTEGER : NaN);
        return value;
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ policy: { acknowledgement: 'accepted', observation: 'active' }, admittedAtObservation: false });
    f.ports.review.now.mockReturnValue(1000); expect(await f.reviews.confirm(preview.operationId, COLLECTION_OWNER)).toEqual({ state: 'expired' });
});
it('partial preference persistence with a matching receipt and opt-in cannot certify the complete confirmed plan', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementationOnce(async (key, value) => {
        const envelope = value as { current: ReturnType<typeof collectionSettings> };
        return set(key, { ...envelope, current: { ...envelope.current, theme: 'dark' } });
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'changed', preference: { state: 'unknown', observation: 'changed' },
        observedPreference: { enabled: true, revision: 1 }, admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set' && c[1].mode === 'active')).toHaveLength(0);
});
it('already-on intent still requires the complete reviewed canonical snapshot before activation', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); const preview = await collectionPreview(f);
    await f.port.set(SETTINGS_KEY, { ...collectionSettings(true), theme: 'dark' });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'changed', admittedAtObservation: false });
});
it('a private start plan missing its policy observation cannot substitute revision zero or submit effects', async () => {
    const f = collectionReviewsFixture(); await f.coordinator.refresh(); const capture = f.coordinator.capture('diagnostics')!;
    expect(await executeCollectionPlan({ id: 'e'.repeat(32), policyId: 'f'.repeat(32), action: 'start', kind: 'diagnostics',
        before: collectionSettings(), capture: { ...capture, policy: null } }, f.repository, f.coordinator, f.policies, () => true, null))
        .toMatchObject({ reason: 'policy-unconfirmed', preference: { state: 'not-attempted' }, admittedAtObservation: false });
    expect(f.port.set).not.toHaveBeenCalled(); expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(0);
});
