import { validSessionPreferenceIntent, currentSessionProfile, sessionPreferenceRestriction,
    type SessionPreferenceIntent, type SessionPreferences } from './session_preferences.ts';
import type { NativeSnapshotOutcome } from './native_snapshot_outcome.ts';
import type { SessionPreferenceBinding } from './session_preference_binding.ts';
import type { SettingsLoad } from './settings.ts';
import { resolveProfile, type ResolvedProfile } from './profile_resolution.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export type SessionPreferenceReviewIntent = SessionPreferenceIntent | { readonly type: 'adopt-observed' };
export type SessionPreferenceReviewIssue = 'denied' | 'stale' | 'conflict' | 'unavailable' | 'future' | 'corrupt' | 'busy' | 'unchanged' | 'expired' | 'precaution' | 'unverified';
export interface SessionPreferenceFacts {
    readonly attempt: 'unobserved' | 'submitted'; readonly acknowledgement: 'accepted' | 'unknown' | null;
    readonly observation: 'committed' | 'different' | 'unavailable' | null;
}
export interface SessionPreferenceResult { readonly state: 'result'; readonly outcome: NativeSnapshotOutcome | { readonly state: 'cancelled' }; readonly facts: SessionPreferenceFacts }
export type SessionPreferenceReviewOutcome = SessionPreferenceResult | { readonly state: SessionPreferenceReviewIssue | 'invalid' | 'not-submitted' }
    | { readonly state: 'pending'; readonly facts: SessionPreferenceFacts };
export interface SessionPreferenceReviewPlan {
    readonly state: 'preview'; readonly operationId: string; readonly revision: number; readonly expiresAt: number;
    readonly settingsRevision: number | null;
    readonly action: 'replace' | 'clear' | 'adopt-observed'; readonly before: SessionPreferences; readonly after: SessionPreferences;
    readonly effectiveBefore: ResolvedProfile | null; readonly effectiveAfter: ResolvedProfile | null;
    readonly restrictionBefore: ReturnType<typeof sessionPreferenceRestriction>; readonly restrictionAfter: ReturnType<typeof sessionPreferenceRestriction>;
    readonly source: { readonly name: string; readonly account: string; readonly repository: string } | null;
    readonly precautionBefore: boolean; readonly precautionAfter: false;
}
export type SessionPreferencePreview = SessionPreferenceReviewPlan | { readonly state: SessionPreferenceReviewIssue }
    | { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'overflow' };
export function copySessionPreferenceReviewIntent(value: unknown): SessionPreferenceReviewIntent | null {
    const valid = (value: unknown): value is SessionPreferenceReviewIntent => record(value) && (value.type === 'adopt-observed'
        ? keys(value, ['type']) && Object.keys(value).length === 1 : validSessionPreferenceIntent(value));
    try {
        if (!valid(value) || !jsonBytesWithin(value, 16384)) return null;
        const copy: unknown = JSON.parse(JSON.stringify(value)); return valid(copy) ? deepFreeze(copy) : null;
    } catch { return null; }
}
/** Effective preference preview only; native/worker pauses and GET authorization remain independent. */
export function sessionPreferenceEffective(settings: SettingsLoad | null, binding: SessionPreferenceBinding, value: SessionPreferences): ResolvedProfile | null {
    if (settings?.state !== 'ready' || binding.state !== 'ready' || binding.context.verified !== true) return null;
    const { context } = binding; const source = settings.settings;
    return resolveProfile(source, source.repositories[context.scope.repositoryId], source.center,
        { host: 'github.com', accountId: context.scope.accountId, repositoryId: context.scope.repositoryId,
            organizationId: binding.organizationId, sessionEpoch: context.credentialEpoch }, currentSessionProfile(value, context) ?? undefined);
}
