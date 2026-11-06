import { expect, it } from 'vitest';
import { isSessionPreferenceMessage } from '../../src/domain/session_preference_protocol.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';

const base = { version: 1, clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2, expectedRevision: 0 };
const preview = { ...base, method: 'center.session-preferences.preview', intent: { type: 'replace', preferences: { paused: true } } };
it('only the five closed native use cases qualify and read does not acquire effect/controller operands', () => {
    const read = { version: 1, clientId: base.clientId, method: 'center.session-preferences.read' };
    expect(isSessionPreferenceMessage(read)).toBe(true); expect(parseCenterMessage(read)).toEqual(read); expect(isSessionPreferenceMessage({ ...read, controllerEpoch: 1 })).toBe(false);
    expect(isSessionPreferenceMessage(preview)).toBe(true); expect(isSessionPreferenceMessage({ ...preview, intent: { type: 'adopt-observed' } })).toBe(true);
    for (const method of ['confirm', 'cancel', 'result']) expect(isSessionPreferenceMessage({ ...base, method: `center.session-preferences.${method}`, operationId: 'b'.repeat(32) })).toBe(true);
});
it.each([null, [], {}, { ...preview, version: 2 }, { ...preview, method: 'center.session-preferences.set' }, { ...preview, clientId: 'caller' },
    { ...preview, controllerEpoch: -1 }, { ...preview, credentialEpoch: 1.5 }, { ...preview, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...preview, scope: {} }, { ...preview, witness: {} }, { ...preview, approved: true }, { ...preview, sourceTree: 'caller' },
    { ...preview, intent: { type: 'replace', preferences: { permission: true } } }, { ...preview, intent: { type: 'replace', preferences: {}, scope: {} } },
    { ...base, method: 'center.session-preferences.confirm', operationId: 'invalid' }, { ...base, method: 'center.session-preferences.cancel' }].map(value => ({ value })))('untrusted or incomplete native frame $value never becomes a reusable preference authority', ({ value }) => {
    expect(isSessionPreferenceMessage(value)).toBe(false); expect(parseCenterMessage(value)).toBeNull();
});
