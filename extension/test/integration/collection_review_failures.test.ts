import { expect, it, vi } from 'vitest';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm } from '../fixtures/collection_reviews.ts';

it.each(['not-started', 'aborted', 'unknown'] as const)('does not repeat or misreport an activation with native outcome %s', async effect => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' && args[1].mode === 'active'
        ? Promise.resolve({ state: 'unavailable', effect }) : execute(...args));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'policy-unconfirmed', preference: { state: 'committed' },
        policy: { acknowledgement: effect === 'unknown' ? 'unknown' : 'not-applied', observation: 'paused', attributed: false }, admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
});
it('a native success acknowledgement without a canonical write never grants admission', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set'
        ? Promise.resolve({ state: 'written', policy: activeCollectionPolicy() }) : execute(...args));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ policy: { acknowledgement: 'accepted', observation: 'paused' }, admittedAtObservation: false });
});
it('keeps known accepted policy persistence when independent readback becomes unavailable', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!; let submitted = false;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        if (submitted && args[1].type === 'read') throw new Error('native-read');
        const result = await execute(...args); if (args[1].type === 'set') submitted = true; return result;
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ policy: { acknowledgement: 'accepted', observation: 'unavailable' }, admittedAtObservation: false });
});
it('does not attribute a coincident active policy to its own unknown request', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const result = await execute(...args);
        if (args[1].type === 'set') { const policy = f.values.get('diagnostics') as ReturnType<typeof activeCollectionPolicy>;
            f.values.set('diagnostics', { ...policy, receipt: { ...policy.receipt!, id: 'f'.repeat(32) } }); return { state: 'unavailable', effect: 'unknown' }; }
        return result;
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ policy: { acknowledgement: 'unknown', observation: 'active', attributed: false }, admittedAtObservation: false });
});
it('does not automatically repeat the unknown metadata stop while independently saving off', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' ? Promise.resolve({ state: 'unavailable', effect: 'unknown' }) : execute(...args));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', observedPreference: { enabled: false },
        policy: { acknowledgement: 'unknown', observation: 'active', attributed: false } });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
});
it('can reconcile a lost first-phase readback without repeating preference publication', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const inspect = f.repository.inspect.bind(f.repository);
    vi.spyOn(f.repository, 'inspect').mockImplementationOnce(inspect).mockRejectedValueOnce(new Error('readback'));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', preference: { state: 'unknown', acknowledgement: 'accepted' },
        observedPreference: { enabled: true, revision: 1 }, admittedAtObservation: true }); expect(f.port.set).toHaveBeenCalledTimes(1);
});
it('a canonical phase-boundary failure does not erase a known first-phase commit or submit activation', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const inspect = f.repository.inspect.bind(f.repository);
    vi.spyOn(f.repository, 'inspect').mockImplementationOnce(inspect).mockImplementationOnce(inspect).mockRejectedValueOnce(new Error('canonical'));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'unavailable', preference: { state: 'committed' }, admittedAtObservation: false });
});
it('preference and policy lease cleanup failures cannot erase known successful facts', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const reserve = f.repository.reserveMutations.bind(f.repository);
    vi.spyOn(f.repository, 'reserveMutations').mockImplementation(() => { const held = reserve(); return held && { current: held.current,
        release() { held.release(); throw new Error('cleanup'); } }; });
    const activate = f.coordinator.reserveActivation.bind(f.coordinator);
    vi.spyOn(f.coordinator, 'reserveActivation').mockImplementation((...args) => { const held = activate(...args); return held && {
        current: held.current, accept: held.accept, release() { held.release(); throw new Error('cleanup'); } }; });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', admittedAtObservation: true });
    expect((await f.repository.update(s => ({ ...s, theme: 'dark' }))).theme).toBe('dark');
});
it('an exhausted preference counter still permits one independent durable policy stop', async () => {
    const f = collectionReviewsFixture(collectionSettings(true, false, Number.MAX_SAFE_INTEGER)); f.values.set('diagnostics', activeCollectionPolicy());
    const preview = await collectionPreview(f, 'stop');
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'preference-unconfirmed', preference: { state: 'invalid' },
        observedPreference: { enabled: true, revision: Number.MAX_SAFE_INTEGER }, policy: { observation: 'paused', attributed: true }, admittedAtObservation: false });
    expect(f.port.set).not.toHaveBeenCalled(); expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
    expect(f.coordinator.state('diagnostics')).toMatchObject({ policy: 'paused', collecting: false });
});
