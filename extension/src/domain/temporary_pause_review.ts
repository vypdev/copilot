import type { TemporaryPauseIntent, TemporaryPauses } from './temporary_pauses.ts';
import { validTemporaryPauseIntent } from './temporary_pauses.ts';
import type { TemporaryPauseOutcome } from './temporary_pause_result.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export type PauseReviewIntent = TemporaryPauseIntent | { readonly type: 'adopt-observed' };
export type PauseReviewIssue = 'denied' | 'stale' | 'conflict' | 'unavailable' | 'future' | 'corrupt' | 'busy' | 'unchanged' | 'expired' | 'precaution';
export type PauseReviewOutcome = TemporaryPauseOutcome | { readonly state: 'denied' | 'expired' | 'cancelled' | 'pending' | 'not-submitted' };
export type PauseReviewTarget = { readonly kind: 'emergency' | 'precaution' }
    | { readonly kind: 'tab'; readonly tabId: number; readonly label: string | null };
export interface PauseReviewPlan {
    readonly state: 'preview'; readonly operationId: string; readonly revision: number; readonly expiresAt: number;
    readonly action: 'change' | 'adopt-observed'; readonly before: TemporaryPauses; readonly after: TemporaryPauses;
    readonly precautionBefore: boolean; readonly precautionAfter: boolean; readonly target: PauseReviewTarget;
}
export type PauseReviewPreview = PauseReviewPlan | { readonly state: PauseReviewIssue }
    | { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'capacity' | 'overflow' };
export function validPauseReviewIntent(value: unknown): value is PauseReviewIntent {
    return record(value) && (value.type === 'adopt-observed'
        ? keys(value, ['type']) && Object.keys(value).length === 1 : validTemporaryPauseIntent(value));
}
/** Only detached closed intent survives a preview await; no caller-owned or reactive value becomes a retained plan. */
export function copyPauseReviewIntent(value: unknown): PauseReviewIntent | null {
    try {
        if (!validPauseReviewIntent(value) || !jsonBytesWithin(value, 8192)) return null;
        const snapshot: unknown = JSON.parse(JSON.stringify(value));
        if (!validPauseReviewIntent(snapshot)) return null;
        return deepFreeze(snapshot.type === 'adopt-observed' ? { type: 'adopt-observed' } : snapshot.type === 'emergency'
            ? { type: 'emergency', paused: snapshot.paused } : { type: 'tab', tabId: snapshot.tabId, paused: snapshot.paused });
    } catch { return null; }
}
