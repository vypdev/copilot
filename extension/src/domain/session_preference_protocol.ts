import { settingsOperationId } from './settings_operation.ts';
import { copySessionPreferenceReviewIntent, type SessionPreferenceReviewIntent } from './session_preference_review.ts';
import { jsonBytesWithin, keys, natural, record } from './value.ts';

interface Client { readonly version: 1; readonly clientId: string }
interface Editor extends Client { readonly controllerEpoch: number; readonly credentialEpoch: number; readonly expectedRevision: number }
export type SessionPreferenceMessage = Client & { readonly method: 'center.session-preferences.read' }
    | Editor & { readonly method: 'center.session-preferences.preview'; readonly intent: SessionPreferenceReviewIntent }
    | Editor & { readonly method: 'center.session-preferences.confirm' | 'center.session-preferences.cancel' | 'center.session-preferences.result'; readonly operationId: string };
const METHODS = ['center.session-preferences.read', 'center.session-preferences.preview', 'center.session-preferences.confirm', 'center.session-preferences.cancel', 'center.session-preferences.result'];
/** No caller-provided scope, native snapshot, witness, grant, credential or replacement effect. */
export function isSessionPreferenceMessage(value: unknown): value is SessionPreferenceMessage {
    if (!record(value) || value.version !== 1 || !METHODS.includes(value.method as string) || !settingsOperationId(value.clientId)) return false;
    const fields = ['version', 'method', 'clientId'];
    if (value.method !== 'center.session-preferences.read') {
        if (!natural(value.controllerEpoch) || !natural(value.credentialEpoch) || !natural(value.expectedRevision)) return false;
        fields.push('controllerEpoch', 'credentialEpoch', 'expectedRevision');
        if (value.method === 'center.session-preferences.preview') { if (!copySessionPreferenceReviewIntent(value.intent)) return false; fields.push('intent'); }
        else { if (!settingsOperationId(value.operationId)) return false; fields.push('operationId'); }
    }
    return keys(value, fields) && Object.keys(value).length === fields.length && jsonBytesWithin(value, 32768);
}
