import { expect, it } from 'vitest';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';
import { extensionSender } from '../../src/domain/protocol.ts';
import { MAX_CENTER_REQUEST_BYTES } from '../../src/domain/settings_change.ts';

const client = { version: 1, clientId: 'a'.repeat(32), controllerEpoch: 1 };
it('admits only exact local center methods and their complete operands', () => {
    const messages = [{ version: 1, method: 'center.open' }, { version: 1, method: 'center.read', clientId: client.clientId },
        { version: 1, method: 'center.operation.read', clientId: client.clientId },
        ...['center.claim', 'center.close'].map(method => ({ ...client, method })),
        { ...client, method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, intent: { type: 'preferences', values: { paused: true } } },
        ...['center.confirm', 'center.cancel'].map(method => ({ ...client, method, credentialEpoch: 0, operationId: 'b'.repeat(32), expectedRevision: 0 }))];
    for (const value of messages) {
        expect(parseCenterMessage(value)).toEqual(value);
        expect(parseCenterMessage({ ...value, url: 'https://example.invalid' })).toBe(null);
        for (const key of Object.keys(value)) { const copy = { ...value }; delete copy[key as keyof typeof copy]; expect(parseCenterMessage(copy)).toBe(null); }
    }
});
it('rejects versions, unknown methods, authority identifiers and unsafe revisions before dispatch', () => {
    const valid = { ...client, method: 'center.confirm', credentialEpoch: 0, operationId: 'b'.repeat(32), expectedRevision: 0 };
    for (const value of [null, [], {}, { ...valid, version: 2 }, { ...valid, method: 1 }, { ...valid, method: 'fetch' },
        { ...valid, clientId: 1 }, { ...valid, clientId: 'A'.repeat(32) }, { ...valid, controllerEpoch: -1 },
        { ...valid, operationId: 'short' }, { ...valid, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }]) expect(parseCenterMessage(value)).toBe(null);
});
it('bounds the dedicated preview request by UTF-8 bytes and refuses cyclic intent data', () => {
    const base = { ...client, method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, intent: '' };
    const overhead = JSON.stringify(base).length;
    expect(parseCenterMessage({ ...base, intent: 'x'.repeat(MAX_CENTER_REQUEST_BYTES - overhead) })).not.toBe(null);
    expect(parseCenterMessage({ ...base, intent: 'x'.repeat(MAX_CENTER_REQUEST_BYTES - overhead + 1) })).toBe(null);
    expect(parseCenterMessage({ ...base, intent: 'é'.repeat(MAX_CENTER_REQUEST_BYTES / 2) })).toBe(null);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(parseCenterMessage({ ...base, intent: cyclic })).toBe(null);
});
it('admits only packaged known route hashes across all three native extension schemes', () => {
    for (const scheme of ['chrome-extension', 'moz-extension', 'safari-web-extension']) {
        const root = `${scheme}://A1B2-C3/`;
        const source = { id: 'own', origin: root.slice(0, -1).toLowerCase(), url: `${root}runtime.html#/profiles/local` };
        expect(extensionSender(source, 'own', root)).toBe(true);
        expect(extensionSender({ ...source, url: `${root}runtime.html#` }, 'own', root)).toBe(true);
        for (const hash of ['#/unknown', '#/profiles/%6cocal', '#/profiles/local?token=value', '#/overview#secret', '#/features/unknown', '#https://example.invalid']) {
            expect(extensionSender({ ...source, url: `${root}runtime.html${hash}` }, 'own', root)).toBe(false);
        }
    }
});
