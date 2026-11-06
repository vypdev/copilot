import { EMPTY_METADATA_READ, type MetadataReadView } from './metadata_read_view.ts';
import type { SessionPreferenceRead } from './session_preference_read.ts';
import type { SessionPreferenceReviewIssue, SessionPreferenceReviewOutcome, SessionPreferenceReviewPlan } from './session_preference_review.ts';

export type SessionPreferenceReadView = MetadataReadView<SessionPreferenceRead>;
export type SessionPreferenceReviewPhase = 'preview' | 'committing' | 'cancelling' | 'result' | 'unknown' | 'stale';
export interface SessionPreferenceClientReview {
    readonly phase: SessionPreferenceReviewPhase;
    readonly plan: Omit<SessionPreferenceReviewPlan, 'state' | 'operationId'> | null;
    readonly outcome: SessionPreferenceReviewOutcome | null;
}
export interface SessionPreferenceReviewView {
    readonly review: SessionPreferenceClientReview | null; readonly busy: boolean; readonly checking: boolean;
    readonly canInspect: boolean; readonly issue: SessionPreferenceReviewIssue | 'invalid' | 'overflow' | null;
}
export interface SessionPreferenceClientView extends SessionPreferenceReviewView { readonly reader: SessionPreferenceReadView }
export const EMPTY_SESSION_PREFERENCE_VIEW: SessionPreferenceClientView = Object.freeze({ reader: EMPTY_METADATA_READ, review: null,
    busy: false, checking: false, canInspect: false, issue: null });
/** Opaque operation selectors remain exclusively in the native client owner. */
export function publicSessionPreferenceReview(plan: SessionPreferenceReviewPlan, phase: SessionPreferenceReviewPhase,
    outcome: SessionPreferenceReviewOutcome | null = null): SessionPreferenceClientReview {
    const { state: _state, operationId: _id, ...visible } = plan;
    return { phase, plan: phase === 'stale' ? null : visible, outcome };
}
