import { expect, it } from 'vitest';
import { decodeCollectionInspection, decodeCollectionOutcome, decodeCollectionPreview } from '../../src/domain/collection_reply.ts';
import { historyWireExamples, changedHistoryField as change } from '../fixtures/history_wire.ts';

it('validates actual reviewed start/stop and their separate phase facts without retaining the provider object', async () => {
    const f = await historyWireExamples(); for (const value of [f.start, f.stop]) expect(decodeCollectionPreview(value)).toEqual(value);
    for (const value of [f.started, f.stopped]) { const decoded = decodeCollectionOutcome(value); expect(decoded).toEqual(value); expect(decoded).not.toBe(value); expect(Object.isFrozen(decoded)).toBe(true); }
});
it.each([
    ['operationId', 'private'], ['kind', 'foreign'], ['action', 'execute'], ['settingsRevision', -1],
    ['policyBefore', 'inferred'], ['policyRevision', null], ['preferenceBefore', 1], ['preferenceAfter', false],
    ['policyAfter', 'paused'], ['expiresAt', NaN], ['policyId', 'b'.repeat(32)],
])('rejects malformed/unsafe collection preview %s', async (field, value) => {
    const f = await historyWireExamples(); expect(decodeCollectionPreview(change(f.start, field, value))).toBeNull();
});
it('preserves an explicit unknown-policy stop preview without inventing a revision or activation', async () => {
    const f = await historyWireExamples(); const preview = { ...f.stop, policyBefore: 'unknown', policyRevision: null };
    expect(decodeCollectionPreview(preview)).toEqual(preview); expect(decodeCollectionPreview({ ...preview, policyRevision: 0 })).toBeNull();
});
it.each([
    ['action', 'execute'], ['kind', 'foreign'], ['reason', 'assumed'], ['preference', null], ['preference', { state: 'cancelled' }],
    ['preference', { state: 'committed', revision: -1, acknowledgement: 'accepted', current: true }],
    ['observedPreference', {}], ['observedPreference.enabled', 'true'], ['observedPreference.revision', -1],
    ['preferenceVerifiedAtObservation', null], ['policy', null], ['policy.acknowledgement', 'inferred'],
    ['policy.observation', 'future'], ['policy.revision', null], ['policy.attributed', 1],
    ['admittedAtObservation', 'true'], ['sourceCurrentAtObservation', null], ['privateToken', 'private'],
])('rejects malformed/contradictory phase result %s', async (path, value) => {
    const f = await historyWireExamples(); expect(decodeCollectionOutcome(change(f.started, path, value))).toBeNull();
});
it('retains truthful partial, already-saved, unattempted and unknown facts instead of filling missing effects', async () => {
    const f = await historyWireExamples(); const base = f.started;
    expect(base.state).toBe('settled');
    const partial = { ...base, reason: 'policy-unconfirmed', preference: { state: 'already', revision: 1 }, observedPreference: null,
        policy: { acknowledgement: 'unknown', observation: 'unavailable', revision: null, attributed: false }, admittedAtObservation: false };
    expect(decodeCollectionOutcome(partial)).toEqual(partial);
    expect(decodeCollectionOutcome({ ...partial, preference: { state: 'not-attempted', revision: 0 } })).not.toBeNull();
    expect(decodeCollectionOutcome({ ...partial, preference: { state: 'not-attempted', revision: -1 } })).toBeNull();
    expect(decodeCollectionOutcome(change(partial, 'policy.revision', 1))).toBeNull();
});
it.each([
    { acknowledgement: 'accepted', observation: 'unavailable', revision: null },
    { acknowledgement: 'not-attempted', observation: 'active', revision: 1 },
])('rejects attribution without an observed and attempted policy effect: $acknowledgement, $observation', async policy => {
    const { started } = await historyWireExamples();
    const attributed = { ...started, policy: { ...policy, attributed: true } };
    expect(decodeCollectionOutcome(attributed)).toBeNull();
    expect(decodeCollectionInspection(attributed)).toBeNull();
    const unverified = { ...started, policy: { ...policy, attributed: false } };
    expect(decodeCollectionOutcome(unverified)).toEqual(unverified);
    expect(decodeCollectionInspection(unverified)).toEqual(unverified);
});
it.each(['invalid', 'denied', 'stale', 'expired', 'unavailable', 'busy', 'future', 'corrupt', 'migration-required', 'conflict', 'globally-paused', 'pause-unconfirmed', 'exhausted'])(
    'accepts the explicit %s issue without accepting undocumented data', state => {
        expect(decodeCollectionPreview({ state })).toEqual({ state }); expect(decodeCollectionOutcome({ state })).toEqual({ state });
        expect(decodeCollectionOutcome({ state, private: 'private' })).toBeNull();
    });
it('distinguishes unsubmitted inspection, in-flight observation, cancellation and unsupported responses', () => {
    expect(decodeCollectionInspection({ state: 'not-submitted' })).toEqual({ state: 'not-submitted' }); expect(decodeCollectionOutcome({ state: 'not-submitted' })).toBeNull();
    for (const state of ['pending', 'cancelled']) expect(decodeCollectionInspection({ state })).toEqual({ state });
    expect(decodeCollectionPreview({ state: 'unchanged' })).toEqual({ state: 'unchanged' }); expect(decodeCollectionOutcome({ state: 'assumed' })).toBeNull();
    expect(decodeCollectionPreview(null)).toBeNull(); expect(decodeCollectionOutcome(null)).toBeNull();
});
