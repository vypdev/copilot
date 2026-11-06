import type { SessionPreferenceRead } from './session_preference_read.ts';
import type { SessionPreferenceReviewIntent, SessionPreferenceReviewPlan } from './session_preference_review.ts';
import { sameSessionPreferenceSnapshot } from './session_preference_reply.ts';
import { planSessionPreferences, sessionPreferenceRestriction, sameSessionPreferenceScope } from './session_preferences.ts';

export function sessionPreferencePlanSourceMatches(plan: Pick<SessionPreferenceReviewPlan, 'settingsRevision' | 'source' | 'after' | 'action'>, read: SessionPreferenceRead): boolean {
    const source = read.source;
    const expected = source?.state === 'ready' && source.context.verified
        ? { name: source.name, account: source.account, repository: source.repository } : null;
    return plan.settingsRevision === read.settingsRevision && JSON.stringify(plan.source) === JSON.stringify(expected)
        && (plan.action !== 'replace' || plan.after.scope === null || source?.state === 'ready' && sameSessionPreferenceScope(plan.after.scope, source.context.scope));
}

/** Metadata can withdraw a review, but cannot certify whether its retained operation completed. */
export function sameSessionPreferenceSource(left: SessionPreferenceRead, right: SessionPreferenceRead): boolean {
    return JSON.stringify(left.source) === JSON.stringify(right.source) && left.settingsState === right.settingsState
        && left.settingsRevision === right.settingsRevision;
}
export function sessionPreferencePreviewMatches(plan: SessionPreferenceReviewPlan, intent: SessionPreferenceReviewIntent,
    read: SessionPreferenceRead, revision: number): boolean {
    if (read.loaded.state !== 'ready' || read.pending || plan.revision !== revision || plan.action !== intent.type
        || !sameSessionPreferenceSnapshot(plan.before, read.loaded.value) || plan.settingsRevision !== read.settingsRevision
        || JSON.stringify(plan.effectiveBefore) !== JSON.stringify(read.effective) || plan.precautionBefore !== read.precaution
        || JSON.stringify(plan.restrictionBefore) !== JSON.stringify(read.restriction)) return false;
    const source = read.source;
    if (!sessionPreferencePlanSourceMatches(plan, read)) return false;
    if (intent.type === 'adopt-observed') return true; // Decoder already requires identical snapshots and guard-only adoption.
    const context = source?.state === 'ready' ? source.context : null;
    const change = planSessionPreferences(read.loaded.value, context?.scope ?? null, intent, revision);
    return change.state === 'ready' && sameSessionPreferenceSnapshot(change.after, plan.after)
        && JSON.stringify(sessionPreferenceRestriction({ state: 'ready', value: plan.after }, context)) === JSON.stringify(plan.restrictionAfter);
}
