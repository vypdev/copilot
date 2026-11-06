import { expect, it } from 'vitest';
import { decodePauseControl, decodePausePreview, decodePauseOutcome, pauseOutcomeMatches, samePauseSnapshot } from '../../src/domain/pause_reply.ts';
import { publicPauseReview, EMPTY_PAUSE_VIEW } from '../../src/domain/pause_client_view.ts';
import { pauseControlWire, pausePlanWire } from '../fixtures/pause_wire.ts';

it('decodes owned frozen metadata without freezing the provider record or retaining hidden fields', () => {
    const raw = pauseControlWire(); const value = decodePauseControl(raw); expect(value).toEqual(raw); expect(value).not.toBe(raw);
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value?.targets)).toBe(true); expect(Object.isFrozen(raw)).toBe(false);
    expect(decodePauseControl({ ...raw, witness: {} })).toBeNull(); expect(decodePauseControl({ ...raw, sourceTree: 'wrong-layer' })).toBeNull();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('a %s native document remains unavailable, never an empty default', state => {
    const value = { ...pauseControlWire(), loaded: { state } }; expect(decodePauseControl(value)?.loaded).toEqual({ state });
    expect(decodePauseControl({ ...value, loaded: { state, value: {} } })).toBeNull();
});
it.each([null, [], { state: 'ready' }, { ...pauseControlWire(), precaution: 1 }, { ...pauseControlWire(), pending: 'false' },
    { ...pauseControlWire(), state: 'unknown' }, { ...pauseControlWire(), loaded: { state: 'ready' } },
    { ...pauseControlWire(), loaded: { state: 'ready', value: { revision: 0 } } }, { ...pauseControlWire(), loaded: { state: 'foreign' } }])('rejects malformed native metadata %j', value => { expect(decodePauseControl(value)).toBeNull(); });
it.each(['unavailable', 'stale'] as const)('metadata can disclose %s tab choices independently from its native pause record', state => {
    expect(decodePauseControl({ ...pauseControlWire(), targets: { state } })?.targets).toEqual({ state });
});
it.each([null, { state: 'ready', tabs: [], limited: 1 }, { state: 'ready', tabs: 'private', limited: false },
    { state: 'ready', tabs: [{ tabId: -1, label: null }], limited: false }, { state: 'ready', tabs: [{ tabId: 7, label: '' }], limited: false },
    { state: 'ready', tabs: [{ tabId: 7, label: 'private\nvalue' }], limited: false }, { state: 'ready', tabs: [{ tabId: 7, label: 'x'.repeat(241) }], limited: false },
    { state: 'ready', tabs: [{ tabId: 7, label: null, source: 'private' }], limited: false },
    { state: 'ready', tabs: [{ tabId: 7, label: null }, { tabId: 7, label: null }], limited: false },
    { state: 'ready', tabs: Array.from({ length: 129 }, (_, tabId) => ({ tabId, label: null })), limited: true }, { state: 'foreign' }])('rejects malformed or private native choices %j', targets => { expect(decodePauseControl({ ...pauseControlWire(), targets })).toBeNull(); });
it('accepts boundary-size metadata and generic labels without URLs, titles or a new grant', () => {
    const targets = { state: 'ready', tabs: Array.from({ length: 128 }, (_, tabId) => ({ tabId, label: tabId ? 'x'.repeat(240) : null })), limited: true };
    expect(decodePauseControl({ ...pauseControlWire(), targets })?.targets).toEqual(targets);
});
it.each([['emergency', true], ['emergency', false], ['tab', true], ['tab', false], ['adopt-observed', true]] as const)('decodes only the exact retained %s/%s plan', (kind, paused) => {
    const raw = pausePlanWire(kind, paused); const decoded = decodePausePreview(raw); expect(decoded).toEqual(raw); expect(decoded).not.toBe(raw); expect(Object.isFrozen(decoded)).toBe(true);
});
it.each([{ operationId: 'private' }, { revision: -1 }, { expiresAt: -1 }, { action: 'all' }, { precautionBefore: 1 }, { precautionAfter: 'false' },
    { target: { kind: 'all' } }, { target: { kind: 'emergency', source: 'private' } }, { target: { kind: 'tab', tabId: -1, label: null } },
    { target: { kind: 'tab', tabId: 7, label: 'x\u202E' } }, { target: { kind: 'tab', tabId: 7, label: '' } },
    { before: null }, { after: null }, { witness: {} }, { approval: true }])('rejects a forged or partial retained plan %j', patch => { expect(decodePausePreview({ ...pausePlanWire(), ...patch })).toBeNull(); });
it('a native review cannot change unrelated scopes or reuse a wrong revision', () => {
    const plan = pausePlanWire('tab');
    for (const after of [{ ...plan.after, emergency: true }, { ...plan.after, tabs: [7, 9] }, { ...plan.after, revision: 0 }, plan.before]) expect(decodePausePreview({ ...plan, after })).toBeNull();
    expect(decodePausePreview({ ...plan, revision: 1 })).toBeNull(); expect(decodePausePreview({ ...plan, before: { ...plan.before, revision: 1 } })).toBeNull();
});
it('adoption proves only unchanged observed state with explicit extra-precaution removal', () => {
    const plan = pausePlanWire('adopt-observed');
    for (const patch of [{ target: { kind: 'emergency' } }, { precautionBefore: false }, { precautionAfter: true }, { after: { ...plan.after, emergency: true } }]) expect(decodePausePreview({ ...plan, ...patch })).toBeNull();
});
it('ordinary changes preserve precaution and cannot present a resumption while precaution is active', () => {
    const pause = pausePlanWire(); expect(decodePausePreview({ ...pause, precautionBefore: true, precautionAfter: true })).not.toBeNull();
    expect(decodePausePreview({ ...pause, precautionBefore: true })).toBeNull(); expect(decodePausePreview({ ...pause, target: { kind: 'precaution' } })).toBeNull();
    expect(decodePausePreview({ ...pausePlanWire('tab', false), precautionBefore: true, precautionAfter: true })).toBeNull();
});
it.each(['denied', 'stale', 'conflict', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged', 'expired', 'precaution'] as const)('decodes a closed %s preview issue without copying arbitrary errors', state => {
    expect(decodePausePreview({ state })).toEqual({ state }); expect(decodePausePreview({ state, error: 'private' })).toBeNull();
});
it.each(['invalid-input', 'capacity', 'overflow'] as const)('preserves the closed %s preview reason', reason => { expect(decodePausePreview({ state: 'invalid', reason })).toEqual({ state: 'invalid', reason }); });
it('unknown states, malformed JSON values and unsupported reasons never become a usable preview', () => {
    expect(decodePausePreview(null)).toBeNull(); expect(decodePausePreview({ state: 'invalid', reason: 'private' })).toBeNull();
    expect(decodePausePreview({ state: 'foreign' })).toBeNull(); expect(decodePausePreview({ state: 'preview', toJSON() { throw new Error('private'); } })).toBeNull();
});
it('snapshot comparison is semantic and canonical, not property order or caller-owned array identity', () => {
    const value = { ...pausePlanWire().before, tabs: [9, 7] }; expect(samePauseSnapshot(value, { tabs: [7, 9], emergency: false, revision: 0, schemaVersion: 1 })).toBe(true);
    expect(samePauseSnapshot(null, value)).toBe(false); expect(samePauseSnapshot(value, null)).toBe(false); expect(samePauseSnapshot(value, { ...value, emergency: true })).toBe(false);
});
it.each(['accepted', 'unknown'] as const)('committed %s acknowledgement stays separate from a sampled lost source', acknowledgement => {
    const result = { state: 'committed', revision: 1, acknowledgement, current: false } as const; expect(decodePauseOutcome(result)).toEqual(result);
    expect(pauseOutcomeMatches(pausePlanWire(), result)).toBe(true);
});
it.each(['different', 'unavailable'] as const)('an unknown result retains its %s observation without invented effect or revision', observation => {
    const result = { state: 'unknown', acknowledgement: 'unknown', observation, observedRevision: null, current: true } as const;
    expect(decodePauseOutcome(result)).toEqual(result); expect(decodePauseOutcome({ ...result, observedRevision: 2 })).not.toBeNull();
    expect(pauseOutcomeMatches(pausePlanWire(), result)).toBe(true); expect(pauseOutcomeMatches(pausePlanWire('adopt-observed'), result)).toBe(false);
});
it('reconciliation has no native acknowledgement and matches only that exact adoption revision', () => {
    const result = { state: 'reconciled', revision: 0, current: true } as const; expect(decodePauseOutcome(result)).toEqual(result);
    expect(pauseOutcomeMatches(pausePlanWire('adopt-observed'), result)).toBe(true); expect(pauseOutcomeMatches(pausePlanWire(), result)).toBe(false);
    expect(pauseOutcomeMatches(pausePlanWire('adopt-observed'), { ...result, revision: 1 })).toBe(false); expect(decodePauseOutcome({ ...result, acknowledgement: 'accepted' })).toBeNull();
});
it.each(['invalid', 'conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged', 'denied', 'expired', 'cancelled', 'pending', 'not-submitted'] as const)('decodes only the closed %s outcome', state => {
    expect(decodePauseOutcome({ state })).toEqual({ state }); expect(decodePauseOutcome({ state, private: true })).toBeNull(); expect(pauseOutcomeMatches(pausePlanWire(), { state })).toBe(true);
});
it.each([{ state: 'foreign' }, { state: 'committed', revision: -1, acknowledgement: 'accepted', current: true },
    { state: 'committed', revision: 1, acknowledgement: 'private', current: true }, { state: 'committed', revision: 1, acknowledgement: 'accepted', current: 'true' },
    { state: 'reconciled', revision: -1, current: true }, { state: 'unknown', acknowledgement: 'accepted', observation: 'committed', observedRevision: 0, current: true },
    { state: 'unknown', acknowledgement: 'private', observation: 'different', observedRevision: 0, current: true }, { state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: -1, current: true },
    { state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: 1, current: 1 }])('rejects an unproved or malformed outcome %j', result => { expect(decodePauseOutcome(result)).toBeNull(); });
it('committed effects match only the planned changed revision and never an adoption', () => {
    const result = { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true } as const;
    expect(pauseOutcomeMatches(pausePlanWire(), { ...result, revision: 2 })).toBe(false); expect(pauseOutcomeMatches(pausePlanWire('adopt-observed'), result)).toBe(false);
});
it('public review projections exclude operation authority and purge all snapshots on source retirement', () => {
    const plan = pausePlanWire('tab'); expect(publicPauseReview(plan, 'preview').plan).not.toHaveProperty('operationId');
    expect(publicPauseReview(plan, 'stale')).toEqual({ phase: 'stale', plan: null, outcome: null }); expect(Object.isFrozen(EMPTY_PAUSE_VIEW)).toBe(true);
});
