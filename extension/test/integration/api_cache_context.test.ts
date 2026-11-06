import { expect, it, vi } from 'vitest';
import { requestApiCacheContext } from '../../src/application/api_cache_context.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';
import type { ApiCacheRequest } from '../../src/domain/api_cache_request.ts';
import { deferred } from '../fixtures/runtime.ts';

const owner: CenterIdentity = { clientId: 'a'.repeat(32), controllerEpoch: 2, credentialEpoch: 3, role: 'editor' };
const operationId = 'b'.repeat(32);
it('native authority is added privately, caller operands are discarded and safety results/cancellation stay independent of a settings review', async () => {
    const request = vi.fn(async () => ({ state: 'cancelled' }));
    const result = { method: 'center.cache.result', operationId, scope: 'foreign', clientId: 'foreign' } as unknown as ApiCacheRequest;
    expect(await requestApiCacheContext(result, owner, false, true, request, () => owner)).toEqual({ state: 'cancelled' });
    expect(request).toHaveBeenLastCalledWith({ version: 1, method: 'center.cache.result', operationId, clientId: owner.clientId, controllerEpoch: 2, credentialEpoch: 3 });
    expect(await requestApiCacheContext({ method: 'center.cache.cancel', operationId }, owner, false, true, request, () => owner)).toEqual({ state: 'cancelled' });
    expect(await requestApiCacheContext({ method: 'center.cache.preview' }, owner, false, true, request, () => owner)).toEqual({ state: 'busy' });
    expect(await requestApiCacheContext({ method: 'center.cache.confirm', operationId }, owner, false, true, request, () => owner)).toEqual({ state: 'busy' }); expect(request).toHaveBeenCalledTimes(2);
    await requestApiCacheContext({ method: 'center.cache.preview', scope: 'foreign' } as unknown as ApiCacheRequest, owner, false, false, request, () => owner);
    expect(request).toHaveBeenLastCalledWith({ version: 1, method: 'center.cache.preview', clientId: owner.clientId, controllerEpoch: 2, credentialEpoch: 3 });
});
it('missing/stopped/observer sources never send and ownership or epoch changes retire delayed observations', async () => {
    const request = vi.fn(async () => ({ state: 'cleared' })); const input: ApiCacheRequest = { method: 'center.cache.result', operationId };
    expect(await requestApiCacheContext(input, null, false, false, request, () => owner)).toEqual({ state: 'stale' });
    expect(await requestApiCacheContext(input, owner, true, false, request, () => owner)).toEqual({ state: 'stale' });
    expect(await requestApiCacheContext(input, { ...owner, role: 'observer' }, false, false, request, () => owner)).toEqual({ state: 'denied' }); expect(request).not.toHaveBeenCalled();
    expect(await requestApiCacheContext(input, owner, false, false, request, () => null)).toEqual({ state: 'stale' });
    expect(await requestApiCacheContext(input, owner, false, false, request, () => ({ ...owner, credentialEpoch: 4 }))).toEqual({ state: 'stale' });
});
it('a real CenterClient retires a delayed cache response after native disconnection and does not expose its private authority in the public view', async () => {
    const h = centerClientFixture(); await h.client.start(); const wait = deferred<unknown>(); h.port.send.mockReturnValueOnce(wait.promise);
    const pending = h.client.requestApiCache({ method: 'center.cache.result', operationId }); h.client.disconnected(); wait.resolve({ state: 'cleared', sourceTree: h.port.sourceTree });
    expect(await pending).toEqual({ state: 'stale' }); expect(JSON.stringify(h.client.view)).not.toContain('clientId'); h.client.stop();
});
