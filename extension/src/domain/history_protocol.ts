import { journalKind, type JournalKind } from './journal_facts.ts';
import type { CollectionAction } from './collection_review.ts';
import { settingsOperationId } from './settings_operation.ts';
import { jsonBytesWithin, keys, natural, record } from './value.ts';

interface Client { readonly version: 1; readonly clientId: string }
interface Editor extends Client { readonly controllerEpoch: number; readonly credentialEpoch: number }
interface Confirmation extends Editor { readonly operationId: string }
export type HistoryMessage = Client & { readonly method: 'center.history.read'; readonly kind: JournalKind }
    | Editor & { readonly method: 'center.collection.preview'; readonly kind: JournalKind; readonly action: CollectionAction }
    | Editor & { readonly method: 'center.history.clear.preview'; readonly kind: JournalKind }
    | Confirmation & { readonly method: 'center.collection.confirm' | 'center.collection.cancel' | 'center.history.clear.confirm' | 'center.history.clear.cancel'
        | 'center.collection.result' | 'center.history.clear.result' };
/** Read/result/cancel can observe or retire a review while a primary preference operation is busy. */
export const HISTORY_EFFECTS: Readonly<Record<HistoryMessage['method'], boolean>> = Object.freeze({
    'center.history.read': false, 'center.collection.result': false, 'center.history.clear.result': false,
    'center.collection.cancel': false, 'center.history.clear.cancel': false,
    'center.collection.preview': true, 'center.history.clear.preview': true,
    'center.collection.confirm': true, 'center.history.clear.confirm': true,
});
const METHODS = Object.keys(HISTORY_EFFECTS);
/** These fixed use cases accept no recording facts, private guards, storage commands or provider operands. */
export function isHistoryMessage(value: unknown): value is HistoryMessage {
    if (!record(value) || value.version !== 1 || !METHODS.includes(value.method as string) || !settingsOperationId(value.clientId)) return false;
    const fields = ['version', 'method', 'clientId'];
    if (value.method !== 'center.history.read') {
        if (!natural(value.controllerEpoch) || !natural(value.credentialEpoch)) return false;
        fields.push('controllerEpoch', 'credentialEpoch');
    }
    if (['center.history.read', 'center.collection.preview', 'center.history.clear.preview'].includes(value.method as string)) {
        if (!journalKind(value.kind)) return false; fields.push('kind');
    } else {
        if (!settingsOperationId(value.operationId)) return false; fields.push('operationId');
    }
    if (value.method === 'center.collection.preview') {
        if (value.action !== 'start' && value.action !== 'stop') return false; fields.push('action');
    }
    return keys(value, fields) && Object.keys(value).length === fields.length && jsonBytesWithin(value, 8192);
}
