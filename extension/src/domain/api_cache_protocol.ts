import { jsonBytesWithin, keys, natural, record } from './value.ts';
import { settingsOperationId } from './settings_operation.ts';

interface Editor { readonly version: 1; readonly clientId: string; readonly controllerEpoch: number; readonly credentialEpoch: number }
export type ApiCacheMessage = Editor & { readonly method: 'center.cache.preview' }
    | Editor & { readonly method: 'center.cache.confirm' | 'center.cache.cancel' | 'center.cache.result'; readonly operationId: string };
const METHODS = Object.freeze(['center.cache.preview', 'center.cache.confirm', 'center.cache.cancel', 'center.cache.result']);
/** Only an explicit fixed-scope review; never a caller-selected key, URL, witness or settings revision. */
export function isApiCacheMessage(value: unknown): value is ApiCacheMessage {
    if (!record(value) || value.version !== 1 || !METHODS.includes(value.method as string)
        || !settingsOperationId(value.clientId) || !natural(value.controllerEpoch) || !natural(value.credentialEpoch)) return false;
    const fields = ['version', 'method', 'clientId', 'controllerEpoch', 'credentialEpoch'];
    if (value.method !== 'center.cache.preview') {
        if (!settingsOperationId(value.operationId)) return false;
        fields.push('operationId');
    }
    return keys(value, fields) && Object.keys(value).length === fields.length && jsonBytesWithin(value, 8192);
}
