import { decodeHistoryValue, exactHistoryFields } from './history_decode.ts';
import { deepFreeze, natural } from './value.ts';
import { settingsOperationId } from './settings_operation.ts';

export const API_CACHE_FACT_STATES = Object.freeze(['reviewed', 'cancelled', 'blocked', 'submitted', 'cleared', 'not-applied', 'unknown'] as const);
export type ApiCacheFactState = typeof API_CACHE_FACT_STATES[number];
export interface ApiCacheFact { readonly kind: 'cache-operation'; readonly action: 'clear-api-cache'; readonly state: ApiCacheFactState }
export const apiCacheFact = (value: unknown): value is ApiCacheFact => exactHistoryFields(value, ['kind', 'action', 'state'])
    && value.kind === 'cache-operation' && value.action === 'clear-api-cache' && API_CACHE_FACT_STATES.includes(value.state as ApiCacheFactState);
export function apiCacheFactTransition(before: ApiCacheFact, after: ApiCacheFact): boolean {
    if (!apiCacheFact(before) || !apiCacheFact(after)) return false;
    return before.state === 'reviewed' ? ['cancelled', 'blocked', 'submitted'].includes(after.state)
        : before.state === 'submitted' && ['cleared', 'not-applied', 'unknown'].includes(after.state);
}
/** Coalesced observations may skip a pending desired value, never its persisted submission transition. */
export function mergeApiCacheFact(before: ApiCacheFact, after: ApiCacheFact): ApiCacheFact | null {
    if (!apiCacheFact(before) || !apiCacheFact(after)) return null;
    if (before.state === after.state) return before;
    return apiCacheFactTransition(before, after) || before.state === 'reviewed' && ['cleared', 'not-applied', 'unknown'].includes(after.state)
        ? deepFreeze({ ...after }) : null;
}
export function nextStoredApiCache(before: ApiCacheFact, desired: ApiCacheFact): ApiCacheFact {
    return before.state === 'reviewed' && ['cleared', 'not-applied', 'unknown'].includes(desired.state)
        ? Object.freeze({ kind: 'cache-operation', action: 'clear-api-cache', state: 'submitted' }) : desired;
}
export const API_CACHE_OUTCOMES = Object.freeze(['cleared', 'cancelled', 'unknown', 'stale', 'expired', 'denied', 'unavailable', 'busy', 'invalid', 'not-submitted'] as const);
export type ApiCacheOutcome = { readonly state: typeof API_CACHE_OUTCOMES[number] };
export interface ApiCachePreview { readonly state: 'preview'; readonly operationId: string; readonly expiresAt: number }
export type ApiCacheReply = ApiCacheOutcome | ApiCachePreview;
export function decodeApiCacheReply(value: unknown): ApiCacheReply | null {
    return decodeHistoryValue(value, (v): v is ApiCacheReply => exactHistoryFields(v, ['state'])
        && API_CACHE_OUTCOMES.includes(v.state as ApiCacheOutcome['state'])
        || exactHistoryFields(v, ['state', 'operationId', 'expiresAt']) && v.state === 'preview'
        && settingsOperationId(v.operationId) && natural(v.expiresAt));
}
