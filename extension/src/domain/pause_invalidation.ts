import { exactHistoryFields } from './history_decode.ts';
import { natural } from './value.ts';

export interface PauseTargetInvalidation { readonly tabId: number; readonly retired: boolean }
/** Native tab identity only; URLs, titles, credentials and mutation authority never enter the notification. */
export function pauseTargetInvalidation(value: unknown): PauseTargetInvalidation | null {
    return exactHistoryFields(value, ['version', 'method', 'tabId', 'retired']) && value.version === 1 && value.method === 'center.pauses.targets.changed'
        && natural(value.tabId) && typeof value.retired === 'boolean' ? Object.freeze({ tabId: value.tabId, retired: value.retired }) : null;
}
