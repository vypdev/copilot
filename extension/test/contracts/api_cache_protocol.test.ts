import { expect, it } from 'vitest';
import { isApiCacheMessage } from '../../src/domain/api_cache_protocol.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';

const editor = { version: 1, clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2 };
it('admits only the four closed native cache-review methods and never a caller-selected storage scope or witness', () => {
    for (const method of ['center.cache.preview', 'center.cache.confirm', 'center.cache.cancel', 'center.cache.result']) {
        const message = { ...editor, method, ...(method === 'center.cache.preview' ? {} : { operationId: 'b'.repeat(32) }) };
        expect(isApiCacheMessage(message)).toBe(true); expect(parseCenterMessage(message)).toEqual(message);
        for (const extra of [{ scope: 'all-browser-data' }, { key: 'private' }, { witness: {} }, { secret: 'private' }, { expectedRevision: 0 }, { approved: true }]) {
            expect(isApiCacheMessage({ ...message, ...extra })).toBe(false); expect(parseCenterMessage({ ...message, ...extra })).toBeNull();
        }
    }
    const preview = { ...editor, method: 'center.cache.preview' };
    for (const value of [null, [], {}, { ...preview, version: 2 }, { ...preview, method: 'center.cache.clear' }, { ...preview, clientId: 'invalid' },
        { ...preview, controllerEpoch: -1 }, { ...preview, credentialEpoch: -1 }, { ...preview, operationId: 'b'.repeat(32) },
        { ...editor, method: 'center.cache.confirm' }, { ...editor, method: 'center.cache.result', operationId: 'invalid' }]) expect(isApiCacheMessage(value)).toBe(false);
    const changing = Object.defineProperty({ ...preview }, 'toJSON', { value: () => ({ body: 'x'.repeat(9000) }) });
    expect(isApiCacheMessage(changing)).toBe(false);
});
