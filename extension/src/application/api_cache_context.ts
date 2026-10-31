import type { CenterIdentity } from '../domain/center_reply.ts';
import type { ApiCacheRequest } from '../domain/api_cache_request.ts';
import type { ApiCacheMessage } from '../domain/api_cache_protocol.ts';

/** The foreground asks for semantics, never supplies reusable native ownership or a cache selector. */
export async function requestApiCacheContext(input: ApiCacheRequest, owner: CenterIdentity | null, stopped: boolean, blocked: boolean,
    request: (message: ApiCacheMessage) => Promise<Record<string, unknown> | null>, current: () => CenterIdentity | null): Promise<Record<string, unknown> | null> {
    if (stopped || !owner) return { state: 'stale' };
    if (owner.role !== 'editor') return { state: 'denied' };
    if ((input.method === 'center.cache.preview' || input.method === 'center.cache.confirm') && blocked) return { state: 'busy' };
    const message: ApiCacheMessage = input.method === 'center.cache.preview'
        ? { method: input.method, version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch }
        : { method: input.method, operationId: input.operationId, version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch };
    const result = await request(message);
    const after = current();
    return (['clientId', 'controllerEpoch', 'credentialEpoch', 'role'] as const).every(key => after?.[key] === owner[key]) ? result : { state: 'stale' };
}
