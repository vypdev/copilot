import { MAX_CENTER_REQUEST_BYTES } from './settings_change.ts';
import { settingsOperationId } from './settings_operation.ts';
import { jsonBytesWithin, keys, natural, record } from './value.ts';

interface Version { readonly version: 1 }
interface Client extends Version { readonly clientId: string }
interface Editor extends Client { readonly controllerEpoch: number }
interface Confirmation extends Editor { readonly operationId: string; readonly expectedRevision: number }
export type CenterMessage = Version & { readonly method: 'center.open' }
    | Client & { readonly method: 'center.read' }
    | Editor & { readonly method: 'center.claim' }
    | Editor & { readonly method: 'center.close' }
    | Editor & { readonly method: 'center.preview'; readonly intent: unknown }
    | Confirmation & { readonly method: 'center.confirm' }
    | Confirmation & { readonly method: 'center.cancel' };
export const MAX_CENTER_RESPONSE_BYTES = 132 * 1024;

/** Center authority is a closed protocol; content pages never receive these methods. */
export function parseCenterMessage(value: unknown): CenterMessage | null {
    if (!record(value) || value.version !== 1 || typeof value.method !== 'string') return null;
    const fields = ['version', 'method'];
    if (value.method === 'center.open') return keys(value, fields) && Object.keys(value).length === 2 ? value as unknown as CenterMessage : null;
    if (!['center.read', 'center.claim', 'center.close', 'center.preview', 'center.confirm', 'center.cancel'].includes(value.method)
        || !settingsOperationId(value.clientId)) return null;
    fields.push('clientId');
    if (value.method !== 'center.read') {
        if (!natural(value.controllerEpoch)) return null;
        fields.push('controllerEpoch');
    }
    if (value.method === 'center.preview') fields.push('intent');
    if (value.method === 'center.confirm' || value.method === 'center.cancel') {
        if (!settingsOperationId(value.operationId) || !natural(value.expectedRevision)) return null;
        fields.push('operationId', 'expectedRevision');
    }
    return keys(value, fields) && Object.keys(value).length === fields.length
        && jsonBytesWithin(value, value.method === 'center.preview' ? MAX_CENTER_REQUEST_BYTES : 8192)
        ? value as unknown as CenterMessage : null;
}
