import { expect, it, vi } from 'vitest';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { collectionReviewsFixture, collectionPreview, collectionConfirm, COLLECTION_OWNER } from '../fixtures/collection_reviews.ts';

it('review exposes the exact two phases but neither a policy nonce nor a background witness', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f);
    expect(preview).toMatchObject({ action: 'start', kind: 'diagnostics', settingsRevision: 0, policyRevision: 0,
        preferenceBefore: false, preferenceAfter: true, policyBefore: 'paused', policyAfter: 'active' });
    expect(Object.keys(preview).sort()).toEqual(['action', 'expiresAt', 'kind', 'operationId', 'policyAfter', 'policyBefore', 'policyRevision',
        'preferenceAfter', 'preferenceBefore', 'settingsRevision', 'state']);
    expect(Object.isFrozen(preview)).toBe(true); expect(f.port.set).not.toHaveBeenCalled();
});
it.each(['diagnostics', 'recents'] as const)('activates %s only after observed preference publication and exact policy admission', async kind => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f, 'start', kind); f.events.length = 0;
    const result = await collectionConfirm(f, preview.operationId); await f.coordinator.refresh();
    expect(result).toMatchObject({ state: 'settled', reason: 'done', preference: { state: 'committed' }, observedPreference: { enabled: true, revision: 1 },
        policy: { acknowledgement: 'accepted', observation: 'active', revision: 1, attributed: true }, admittedAtObservation: true, sourceCurrentAtObservation: true });
    expect(f.events.indexOf('preferences:set')).toBeLessThan(f.events.indexOf(`${kind}:set`)); expect(f.coordinator.admission(kind)?.current()).toBe(true);
});
it('does not reuse a preexisting active marker when saving an opt-in and activating it', async () => {
    const f = collectionReviewsFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f);
    const result = await collectionConfirm(f, preview.operationId); await f.coordinator.refresh();
    expect(result).toMatchObject({ reason: 'done', policy: { observation: 'active', revision: 3 }, admittedAtObservation: true });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set').map(c => c[1])).toMatchObject([
        { mode: 'paused', expectedRevision: 1, settingsRevision: 0 }, { mode: 'active', expectedRevision: 2, settingsRevision: 1 }]);
});
it('can activate genuinely imported saved intent without fabricating an unchanged settings operation', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); const preview = await collectionPreview(f);
    const result = await collectionConfirm(f, preview.operationId); await f.coordinator.refresh();
    expect(result).toMatchObject({ reason: 'done', preference: { state: 'already', revision: 0 }, admittedAtObservation: true });
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.coordinator.state('diagnostics').collecting).toBe(true);
});
it('stops new admission synchronously and makes just one policy-pause attempt before saving off', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    const ticket = f.coordinator.admission('diagnostics')!; const result = f.reviews.confirm(preview.operationId, COLLECTION_OWNER); expect(ticket.current()).toBe(false);
    expect(await result).toMatchObject({ reason: 'done', observedPreference: { enabled: false, revision: 1 }, policy: { observation: 'paused', attributed: true }, admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(1);
});
it('still saves an off preference while preserving a future policy without repairing or rewriting it', async () => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', { schemaVersion: 99 }); const preview = await collectionPreview(f, 'stop');
    expect(preview.policyBefore).toBe('unknown'); expect(preview.policyRevision).toBeNull();
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', observedPreference: { enabled: false }, policy: { observation: 'unavailable' } });
    expect(f.values.get('diagnostics')).toEqual({ schemaVersion: 99 }); expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set')).toHaveLength(0);
});
it('stops an obsolete active policy with already-off intent and performs no fake preference write', async () => {
    const f = collectionReviewsFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const preview = await collectionPreview(f, 'stop');
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', preference: { state: 'already' },
        observedPreference: { enabled: false, revision: 0 }, policy: { observation: 'paused', attributed: true } });
    expect(f.port.set).not.toHaveBeenCalled();
});
it('retains observed preference success when activation acknowledgement is lost after native persistence', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const result = await execute(...args); if (args[1].type === 'set' && args[1].mode === 'active') throw new Error('native-ack'); return result;
    });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', preference: { state: 'committed' },
        policy: { acknowledgement: 'unknown', observation: 'active', attributed: true }, admittedAtObservation: true });
});
it('retains the actual first phase after a lost preference acknowledgement', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementationOnce(async (...args) => { await set(...args); throw new Error('native-ack'); });
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'done', preference: { state: 'committed', acknowledgement: 'unknown' }, admittedAtObservation: true });
});
it('does not activate when the preference was never observed persisted', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f); vi.mocked(f.port.set).mockRejectedValueOnce(new Error('storage'));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ reason: 'changed', preference: { state: 'unknown' }, observedPreference: { enabled: false }, admittedAtObservation: false });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(c => c[1].type === 'set' && c[1].mode === 'active')).toHaveLength(0);
});
it('does not activate after a different saved revision replaces the confirmed plan', async () => {
    const f = collectionReviewsFixture(); const preview = await collectionPreview(f);
    await f.port.set(SETTINGS_KEY, collectionSettings(true, false, 1));
    expect(await collectionConfirm(f, preview.operationId)).toMatchObject({ preference: { state: 'conflict' }, admittedAtObservation: false });
});
