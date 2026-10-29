import { MAX_CENTER_REQUEST_BYTES } from './settings_change.ts';
import { settingsOperationId } from './settings_operation.ts';
import { jsonBytesWithin, keys, natural, record } from './value.ts';
import { connectionIntent, type ConnectionIntent } from './named_sessions.ts';
import { isHistoryMessage, type HistoryMessage } from './history_protocol.ts';

interface Version { readonly version: 1 }
interface Client extends Version { readonly clientId: string }
interface Editor extends Client { readonly controllerEpoch: number }
interface Mutation extends Editor { readonly credentialEpoch: number; readonly expectedRevision: number }
interface Confirmation extends Mutation { readonly operationId: string }
export type CenterMessage = Version & { readonly method: 'center.open' }
    | Client & { readonly method: 'center.read' }
    | Editor & { readonly method: 'center.claim' }
    | Editor & { readonly method: 'center.close' }
    | Mutation & { readonly method: 'center.preview'; readonly intent: unknown }
    | Confirmation & { readonly method: 'center.confirm' }
    | Confirmation & { readonly method: 'center.cancel' };
export type ConnectionMessage = Client & { readonly method: 'center.connections.read' }
    | Editor & { readonly method: 'center.connections.change'; readonly credentialEpoch: number; readonly expectedRevision: number; readonly intent: ConnectionIntent };
export { MAX_CENTER_RESPONSE_BYTES } from './center_limits.ts';

/** Center authority is a closed protocol; content pages never receive these methods. */
export function parseCenterMessage(value: unknown): CenterMessage | ConnectionMessage | HistoryMessage | null {
    if (isHistoryMessage(value)) return value;
    if (!record(value) || value.version !== 1 || typeof value.method !== 'string') return null;
    const fields = ['version', 'method'];
    if (value.method === 'center.open') return keys(value, fields) && Object.keys(value).length === 2 ? value as unknown as CenterMessage : null;
    if (!['center.read', 'center.claim', 'center.close', 'center.preview', 'center.confirm', 'center.cancel', 'center.connections.read', 'center.connections.change'].includes(value.method)
        || !settingsOperationId(value.clientId)) return null;
    fields.push('clientId');
    if (value.method !== 'center.read' && value.method !== 'center.connections.read') {
        if (!natural(value.controllerEpoch)) return null;
        fields.push('controllerEpoch');
    }
    if (['center.preview', 'center.confirm', 'center.cancel', 'center.connections.change'].includes(value.method)) {
        if (!natural(value.credentialEpoch) || !natural(value.expectedRevision)) return null;
        fields.push('credentialEpoch', 'expectedRevision');
    }
    if (value.method === 'center.preview') fields.push('intent');
    if (value.method === 'center.connections.change') {
        if (!connectionIntent(value.intent)) return null;
        fields.push('intent');
    }
    if (value.method === 'center.confirm' || value.method === 'center.cancel') {
        if (!settingsOperationId(value.operationId) || !natural(value.expectedRevision)) return null;
        fields.push('operationId');
    }
    return keys(value, fields) && Object.keys(value).length === fields.length
        && jsonBytesWithin(value, value.method === 'center.preview' ? MAX_CENTER_REQUEST_BYTES : 8192)
        ? value as unknown as CenterMessage | ConnectionMessage : null;
}
