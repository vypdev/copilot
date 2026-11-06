import { expect, it } from 'vitest';
import { copyPauseReviewIntent, validPauseReviewIntent } from '../../src/domain/temporary_pause_review.ts';
import { isPauseMessage } from '../../src/domain/temporary_pause_protocol.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';

const identity = { version: 1, clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2, expectedRevision: 3 };
const preview = { ...identity, method: 'center.pauses.preview', intent: { type: 'emergency', paused: true } };
it.each([
    { version: 1, method: 'center.pauses.read', clientId: identity.clientId }, preview,
    { ...preview, intent: { type: 'tab', tabId: 0, paused: false } }, { ...preview, intent: { type: 'adopt-observed' } },
    ...['confirm', 'cancel', 'result'].map(method => ({ ...identity, method: `center.pauses.${method}`, operationId: 'b'.repeat(32) })),
])('admits exactly the closed native command %j', value => {
    expect(isPauseMessage(value)).toBe(true); expect(parseCenterMessage(value)).toEqual(value);
});
it.each([
    null, [], {}, { ...preview, version: 2 }, { ...preview, method: 'center.pauses.set' }, { ...preview, clientId: 'bad' },
    { ...preview, controllerEpoch: -1 }, { ...preview, credentialEpoch: 0.1 }, { ...preview, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...identity, method: 'center.pauses.preview' }, { ...preview, intent: { type: 'emergency', paused: true, native: true } },
    { ...identity, method: 'center.pauses.confirm', operationId: 'bad' }, { ...identity, method: 'center.pauses.cancel' },
    { ...preview, witness: {} }, { ...preview, approved: true }, { ...preview, after: {} },
    { version: 1, method: 'center.pauses.read', clientId: identity.clientId, controllerEpoch: 1 },
])('rejects unsupported, malformed or forged authority %j', value => { expect(isPauseMessage(value)).toBe(false); expect(parseCenterMessage(value)).toBeNull(); });
it('does not ignore nonenumerable missing required fields or an oversized encoded native message', () => {
    const missing = { ...identity, method: 'center.pauses.preview' }; Object.defineProperty(missing, 'intent', { value: preview.intent });
    expect(isPauseMessage(missing)).toBe(false);
    const value = { ...preview }; Object.defineProperty(value, 'toJSON', { value: () => 'x'.repeat(8193) }); expect(isPauseMessage(value)).toBe(false);
});
it.each([{ type: 'emergency', paused: false }, { type: 'tab', tabId: 7, paused: true }, { type: 'adopt-observed' }])('detaches and freezes the closed intent %j', value => {
    expect(copyPauseReviewIntent(value)).toEqual(value); expect(Object.isFrozen(copyPauseReviewIntent(value))).toBe(true); expect(Object.isFrozen(value)).toBe(false);
});
it.each([null, { type: 'adopt-observed', write: true }, { type: 'adopt-observed', expectedRevision: 1 }, { type: 'tab', tabId: -1, paused: true }])('cannot retain intent %j', value => {
    expect(validPauseReviewIntent(value)).toBe(false); expect(copyPauseReviewIntent(value)).toBeNull();
});
it('revalidates a serialized copy and contains exceptional/oversized serialization', () => {
    const changed = { type: 'adopt-observed' }; Object.defineProperty(changed, 'toJSON', { value: () => ({ type: 'bad' }) });
    expect(copyPauseReviewIntent(changed)).toBeNull(); const exceptional = { type: 'adopt-observed' };
    Object.defineProperty(exceptional, 'type', { get: () => { throw new Error('unavailable'); } }); expect(copyPauseReviewIntent(exceptional)).toBeNull();
    const oversized = { type: 'adopt-observed' }; Object.defineProperty(oversized, 'toJSON', { value: () => 'x'.repeat(8193) }); expect(copyPauseReviewIntent(oversized)).toBeNull();
});
