import { decodeHistoryValue, exactHistoryFields as fields } from './history_decode.ts';
import { copySessionPreferences, currentSessionProfile, planSessionPreferences, sessionPreferenceRestriction, validSessionPreferenceScope } from './session_preferences.ts';
import type { SessionPreferenceBinding } from './session_preference_binding.ts';
import type { SessionPreferenceRead } from './session_preference_read.ts';
import type { SessionPreferenceFacts, SessionPreferencePreview, SessionPreferenceReviewPlan, SessionPreferenceReviewOutcome } from './session_preference_review.ts';
import { validNativeSnapshotOutcome } from './native_snapshot_validation.ts';
import { validResolvedProfile, resolvedSessionMatches } from './resolved_profile_validation.ts';
import { numericIdentity } from './center_profiles.ts';
import { repositoryAddress, sessionName } from './named_sessions.ts';
import { settingsOperationId } from './settings_operation.ts';
import { natural } from './value.ts';

const ISSUES = ['denied', 'stale', 'conflict', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged', 'expired', 'precaution', 'unverified'];
export function sameSessionPreferenceSnapshot(left: unknown, right: unknown): boolean {
    const a = copySessionPreferences(left); const b = copySessionPreferences(right); return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}
function binding(value: unknown): value is SessionPreferenceBinding {
    return fields(value, ['state']) && ['disconnected', 'legacy', 'unavailable', 'stale'].includes(value.state as string)
        || fields(value, ['state', 'context', 'name', 'account', 'repository', 'organizationId']) && value.state === 'ready'
            && fields(value.context, ['scope', 'credentialEpoch', 'verified']) && validSessionPreferenceScope(value.context.scope)
            && natural(value.context.credentialEpoch) && typeof value.context.verified === 'boolean' && sessionName(value.name)
            && typeof value.account === 'string' && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.account) && repositoryAddress(value.repository)
            && (value.organizationId === null || numericIdentity(value.organizationId));
}
export function decodeSessionPreferenceRead(value: unknown): SessionPreferenceRead | null {
    return decodeHistoryValue(value, (v): v is SessionPreferenceRead => {
        if (!fields(v, ['state', 'loaded', 'pending', 'precaution', 'source', 'settingsState', 'settingsRevision', 'effective', 'restriction']) || v.state !== 'ready'
            || typeof v.pending !== 'boolean' || typeof v.precaution !== 'boolean' || !(v.source === null || binding(v.source))
            || !['ready', 'future', 'invalid', 'unavailable'].includes(v.settingsState as string)
            || !(v.settingsState === 'ready' ? natural(v.settingsRevision) : v.settingsRevision === null)) return false;
        const loaded = fields(v.loaded, ['state', 'value']) && v.loaded.state === 'ready' && copySessionPreferences(v.loaded.value)
            ? { state: 'ready' as const, value: copySessionPreferences(v.loaded.value)! }
            : fields(v.loaded, ['state']) && ['future', 'corrupt', 'unavailable'].includes(v.loaded.state as string) ? { state: v.loaded.state as 'future' | 'corrupt' | 'unavailable' } : null;
        if (!loaded) return false;
        const source = v.source as SessionPreferenceBinding | null; const context = source?.state === 'ready' ? source.context : null;
        const expected = sessionPreferenceRestriction(loaded, context);
        const effective = loaded.state === 'ready' && v.settingsState === 'ready' && context?.verified === true;
        return fields(v.restriction, ['paused', 'reason']) && v.restriction.paused === expected.paused && v.restriction.reason === expected.reason
            && (effective ? validResolvedProfile(v.effective) && loaded.state === 'ready' && resolvedSessionMatches(v.effective, currentSessionProfile(loaded.value, context)?.preferences) : v.effective === null);
    });
}
export function validSessionPreferenceFacts(value: unknown): value is SessionPreferenceFacts {
    return fields(value, ['attempt', 'acknowledgement', 'observation']) && ['unobserved', 'submitted'].includes(value.attempt as string)
        && [null, 'accepted', 'unknown'].includes(value.acknowledgement as null) && [null, 'committed', 'different', 'unavailable'].includes(value.observation as null)
        && (value.attempt !== 'unobserved' || value.acknowledgement === null && value.observation === null)
        && (value.acknowledgement !== null || value.observation === null);
}
function plan(value: unknown): value is SessionPreferenceReviewPlan {
    if (!fields(value, ['state', 'operationId', 'revision', 'settingsRevision', 'expiresAt', 'action', 'before', 'after', 'effectiveBefore', 'effectiveAfter', 'restrictionBefore', 'restrictionAfter', 'source', 'precautionBefore', 'precautionAfter'])
        || value.state !== 'preview' || !settingsOperationId(value.operationId) || !natural(value.revision) || !natural(value.expiresAt)
        || !(value.settingsRevision === null || natural(value.settingsRevision))
        || typeof value.precautionBefore !== 'boolean' || typeof value.precautionAfter !== 'boolean'
        || !(value.source === null || fields(value.source, ['name', 'account', 'repository']) && sessionName(value.source.name) && typeof value.source.account === 'string'
            && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.source.account) && repositoryAddress(value.source.repository))
        || !(value.effectiveBefore === null && value.effectiveAfter === null || validResolvedProfile(value.effectiveBefore) && validResolvedProfile(value.effectiveAfter))) return false;
    const before = copySessionPreferences(value.before); const after = copySessionPreferences(value.after);
    if (!before || !after || before.revision !== value.revision) return false;
    for (const restriction of [value.restrictionBefore, value.restrictionAfter]) if (!fields(restriction, ['paused', 'reason']) || typeof restriction.paused !== 'boolean'
        || !['none', 'session', 'retained', 'unknown', 'inactive'].includes(restriction.reason as string) || restriction.paused !== ['session', 'retained', 'unknown'].includes(restriction.reason as string)) return false;
    for (const [snapshot, restriction] of [[before, value.restrictionBefore], [after, value.restrictionAfter]] as const)
        if (snapshot.scope === null && (restriction as { reason: unknown }).reason !== 'none') return false;
    if (value.effectiveBefore !== null && value.effectiveAfter !== null) {
        if (!natural(value.settingsRevision) || value.source === null) return false;
        if (JSON.stringify(value.effectiveBefore.pauseSources.filter(source => source !== 'session')) !== JSON.stringify(value.effectiveAfter.pauseSources.filter(source => source !== 'session'))) return false;
    }
    if (value.action === 'adopt-observed') return value.precautionBefore && !value.precautionAfter && sameSessionPreferenceSnapshot(before, after)
        && JSON.stringify(value.effectiveBefore) === JSON.stringify(value.effectiveAfter) && JSON.stringify(value.restrictionBefore) === JSON.stringify(value.restrictionAfter);
    if (!['replace', 'clear'].includes(value.action as string) || value.precautionBefore || value.precautionAfter) return false;
    if (value.action === 'replace' && (value.source === null || value.effectiveAfter === null || !natural(value.settingsRevision))) return false;
    if (value.effectiveAfter !== null && !resolvedSessionMatches(value.effectiveAfter as NonNullable<SessionPreferenceReviewPlan['effectiveAfter']>, after.preferences)) return false;
    if (value.action === 'clear' && (value.restrictionAfter as { reason: unknown }).reason !== 'none') return false;
    const intent = value.action === 'clear' ? { type: 'clear' as const } : { type: 'replace' as const, preferences: after.preferences };
    const changed = planSessionPreferences(before, after.scope ?? before.scope, intent, value.revision);
    return changed.state === 'ready' && sameSessionPreferenceSnapshot(changed.after, after);
}
export function decodeSessionPreferencePreview(value: unknown): SessionPreferencePreview | null {
    return decodeHistoryValue(value, (v): v is SessionPreferencePreview => plan(v)
        || fields(v, ['state']) && ISSUES.includes(v.state as string)
        || fields(v, ['state', 'reason']) && v.state === 'invalid' && ['invalid-input', 'overflow'].includes(v.reason as string));
}
export function decodeSessionPreferenceOutcome(value: unknown): SessionPreferenceReviewOutcome | null {
    return decodeHistoryValue(value, (v): v is SessionPreferenceReviewOutcome => {
        if (fields(v, ['state']) && [...ISSUES, 'invalid', 'not-submitted'].includes(v.state as string)) return true;
        if (fields(v, ['state', 'facts']) && v.state === 'pending') return validSessionPreferenceFacts(v.facts);
        if (!fields(v, ['state', 'outcome', 'facts']) || v.state !== 'result' || !validSessionPreferenceFacts(v.facts)
            || !(validNativeSnapshotOutcome(v.outcome) || fields(v.outcome, ['state']) && v.outcome.state === 'cancelled')) return false;
        if (v.outcome.state === 'committed') return v.facts.attempt === 'submitted' && v.facts.acknowledgement === v.outcome.acknowledgement && v.facts.observation === 'committed';
        if (v.outcome.state === 'unknown') return (v.facts.acknowledgement === null || v.facts.acknowledgement === v.outcome.acknowledgement)
            && (v.facts.observation === null || v.facts.observation === v.outcome.observation);
        return v.facts.attempt === 'unobserved';
    });
}
export function sessionPreferenceOutcomeMatches(plan: SessionPreferenceReviewPlan, outcome: SessionPreferenceReviewOutcome): boolean {
    if (outcome.state !== 'result') return true;
    return outcome.outcome.state === 'committed' ? plan.action !== 'adopt-observed' && outcome.outcome.revision === plan.after.revision
        : outcome.outcome.state === 'reconciled' ? plan.action === 'adopt-observed' && outcome.outcome.revision === plan.before.revision
            : outcome.outcome.state !== 'unknown' || plan.action !== 'adopt-observed';
}
