import { expect, it } from 'vitest';
import { isHistoryMessage } from '../../src/domain/history_protocol.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';

const client = { version: 1, clientId: 'a'.repeat(32) };
const editor = { ...client, controllerEpoch: 1, credentialEpoch: 0 };
const preview = { ...editor, method: 'center.collection.preview', kind: 'diagnostics', action: 'start' };
const confirm = { ...editor, method: 'center.collection.confirm', operationId: 'b'.repeat(32) };
it.each([
    { ...client, method: 'center.history.read', kind: 'diagnostics' },
    { ...client, method: 'center.history.read', kind: 'recents' }, preview,
    { ...preview, kind: 'recents', action: 'stop' }, { ...editor, method: 'center.history.clear.preview', kind: 'recents' },
    ...['center.collection.confirm', 'center.collection.cancel', 'center.history.clear.confirm', 'center.history.clear.cancel',
        'center.collection.result', 'center.history.clear.result'].map(method => ({ ...confirm, method })),
])('accepts the closed use case $method $kind $action through the center parser', message => {
    expect(isHistoryMessage(message)).toBe(true); expect(parseCenterMessage(message)).toEqual(message);
});
it.each([
    ['not a record', null], ['wrong version', { ...preview, version: 2 }], ['generic recorder', { ...preview, method: 'center.history.append' }],
    ['unbound client', { ...preview, clientId: 'private' }], ['invalid controller epoch', { ...preview, controllerEpoch: -1 }],
    ['missing credential epoch', { ...preview, credentialEpoch: undefined }], ['unknown scope', { ...preview, kind: 'browser-history' }],
    ['unrecognized operation', { ...confirm, operationId: 'private' }], ['arbitrary action', { ...preview, action: 'execute' }],
    ['renderer fact injection', { ...preview, fact: { kind: 'operation' } }], ['read carrying authority', { ...client, method: 'center.history.read', kind: 'diagnostics', operationId: confirm.operationId }],
])('rejects %s before any use case dispatch', (_reason, message) => { expect(isHistoryMessage(message)).toBe(false); expect(parseCenterMessage(message)).toBeNull(); });
it('rejects a hostile serialization that exceeds the fixed request budget', () => {
    const hostile = Object.defineProperty({ ...preview }, 'toJSON', { value: () => ({ private: 'x'.repeat(9000) }) });
    expect(isHistoryMessage(hostile)).toBe(false);
});
