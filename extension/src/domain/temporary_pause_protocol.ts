import { settingsOperationId } from './settings_operation.ts';
import { validPauseReviewIntent, type PauseReviewIntent } from './temporary_pause_review.ts';
import { jsonBytesWithin, keys, natural, record } from './value.ts';

interface Client { readonly version: 1; readonly clientId: string }
interface Editor extends Client { readonly controllerEpoch: number; readonly credentialEpoch: number; readonly expectedRevision: number }
export type PauseMessage = Client & { readonly method: 'center.pauses.read' }
    | Editor & { readonly method: 'center.pauses.preview'; readonly intent: PauseReviewIntent }
    | Editor & { readonly method: 'center.pauses.confirm' | 'center.pauses.cancel' | 'center.pauses.result'; readonly operationId: string };
const METHODS = ['center.pauses.read', 'center.pauses.preview', 'center.pauses.confirm', 'center.pauses.cancel', 'center.pauses.result'];
/** No direct set, source URL, native witness, caller approval or credential is a pause command. */
export function isPauseMessage(value: unknown): value is PauseMessage {
    if (!record(value) || value.version !== 1 || !METHODS.includes(value.method as string) || !settingsOperationId(value.clientId)) return false;
    const fields = ['version', 'method', 'clientId'];
    if (value.method !== 'center.pauses.read') {
        if (!natural(value.controllerEpoch) || !natural(value.credentialEpoch) || !natural(value.expectedRevision)) return false;
        fields.push('controllerEpoch', 'credentialEpoch', 'expectedRevision');
        if (value.method === 'center.pauses.preview') {
            if (!validPauseReviewIntent(value.intent)) return false; fields.push('intent');
        } else {
            if (!settingsOperationId(value.operationId)) return false; fields.push('operationId');
        }
    }
    return keys(value, fields) && Object.keys(value).length === fields.length && jsonBytesWithin(value, 8192);
}
