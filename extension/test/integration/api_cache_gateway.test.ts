import { expect, it } from 'vitest';
import { apiCacheGatewayFixture } from '../fixtures/api_cache_gateway.ts';
import { CENTER_BINDING, CENTER_SENDER } from '../fixtures/center.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import type { ApiCachePreview } from '../../src/domain/api_cache.ts';

it('native cache preview/cancel/confirm/result use their own owner and preserve unreadable preferences without contacting a provider', async () => {
    const f = apiCacheGatewayFixture(); const owner = f.center.open(); const headers = { clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch };
    const original = { schemaVersion: 999, private: 'future preferences preserved' }; f.center.values.set(SETTINGS_KEY, original);
    const preview = await f.call({ ...headers, method: 'center.cache.preview' }) as ApiCachePreview; expect(preview.state).toBe('preview');
    expect(await f.call({ ...headers, method: 'center.cache.result', operationId: preview.operationId })).toEqual({ state: 'not-submitted' });
    expect(await f.call({ ...headers, method: 'center.cache.cancel', operationId: preview.operationId })).toEqual({ state: 'cancelled' });
    expect(f.cache.clear).not.toHaveBeenCalled();
    const next = await f.call({ ...headers, method: 'center.cache.preview' }) as ApiCachePreview;
    expect(await f.call({ ...headers, method: 'center.cache.confirm', operationId: next.operationId })).toEqual({ state: 'cleared' });
    expect(await f.call({ ...headers, method: 'center.cache.result', operationId: next.operationId })).toEqual({ state: 'cleared' }); expect(f.cache.clear).toHaveBeenCalledOnce();
    expect(f.center.values.get(SETTINGS_KEY)).toEqual(original); expect(f.center.port.get).not.toHaveBeenCalled(); expect(f.center.port.set).not.toHaveBeenCalled();
    expect(f.native.reader.read).not.toHaveBeenCalled(); expect(f.native.port.set).not.toHaveBeenCalled(); expect(f.session.reader.read).not.toHaveBeenCalled();
});
it('foreign/content/private senders, observers and moved native epochs cannot inspect or clear the private cache', async () => {
    const f = apiCacheGatewayFixture(); const owner = f.center.open(); const message = { method: 'center.cache.preview', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch };
    for (const sender of [{ ...CENTER_SENDER, id: 'foreign' }, { ...CENTER_SENDER, url: 'https://github.com/octo/example' },
        { ...CENTER_SENDER, url: 'https://evil.test/runtime.html' }, { ...CENTER_SENDER, tab: { id: 1, incognito: true } }]) expect(await f.call(message, sender)).toEqual({ state: 'rejected' });
    expect(await f.call(message, { ...CENTER_SENDER, documentId: 'forged' })).toEqual({ state: 'stale' });
    expect(await f.call({ ...message, credentialEpoch: 99 })).toEqual({ state: 'stale' });
    const binding = { ...CENTER_BINDING, documentId: 'other', tabId: 2 }; const observer = f.center.open(binding);
    expect(await f.call({ ...message, clientId: observer.clientId, controllerEpoch: observer.controllerEpoch }, { ...CENTER_SENDER, documentId: 'other', tab: { id: 2, incognito: false } })).toEqual({ state: 'denied' });
    expect(f.cache.capture).not.toHaveBeenCalled(); expect(f.cache.clear).not.toHaveBeenCalled();
});
it('an absent capability stays unavailable and native shutdown cannot revive an admitted cache confirmation', async () => {
    const absent = apiCacheGatewayFixture(false); const owner = absent.center.open(); const args = { clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch };
    expect(await absent.call({ ...args, method: 'center.cache.preview' })).toEqual({ state: 'unavailable' }); expect(absent.cache.capture).not.toHaveBeenCalled();
    const f = apiCacheGatewayFixture(); const current = f.center.open(); const headers = { clientId: current.clientId, controllerEpoch: current.controllerEpoch, credentialEpoch: current.credentialEpoch };
    const preview = await f.call({ ...headers, method: 'center.cache.preview' }) as ApiCachePreview; f.gateway.shutdown();
    expect(await f.call({ ...headers, method: 'center.cache.confirm', operationId: preview.operationId })).toEqual({ state: 'stale' }); expect(f.cache.clear).not.toHaveBeenCalled();
});
