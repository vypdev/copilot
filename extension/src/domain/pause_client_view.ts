import type { PauseControlView } from './temporary_pause_controls.ts';
import type { PauseReviewIssue, PauseReviewOutcome, PauseReviewPlan } from './temporary_pause_review.ts';

export interface PauseReadView { readonly phase: 'idle' | 'reading' | 'ready' | 'unavailable' | 'stale'; readonly current: boolean; readonly data: PauseControlView | null }
export type PauseReviewPhase = 'preview' | 'committing' | 'cancelling' | 'result' | 'unknown' | 'stale';
export interface PauseClientReview { readonly phase: PauseReviewPhase; readonly plan: Omit<PauseReviewPlan, 'state' | 'operationId'> | null; readonly outcome: PauseReviewOutcome | null }
export type PauseClientIssue = PauseReviewIssue | 'invalid' | 'capacity' | 'overflow';
export interface PauseReviewView { readonly review: PauseClientReview | null; readonly busy: boolean; readonly checking: boolean; readonly canInspect: boolean; readonly issue: PauseClientIssue | null }
export interface PauseClientView extends PauseReviewView { readonly reader: PauseReadView }
export const EMPTY_PAUSE_READ: PauseReadView = Object.freeze({ phase: 'idle', current: false, data: null });
export const EMPTY_PAUSE_VIEW: PauseClientView = Object.freeze({ reader: EMPTY_PAUSE_READ, review: null, busy: false, checking: false, canInspect: false, issue: null });
export function publicPauseReview(plan: PauseReviewPlan, phase: PauseReviewPhase, outcome: PauseReviewOutcome | null = null): PauseClientReview {
    const { state: _state, operationId: _id, ...visible } = plan;
    return { phase, plan: phase === 'stale' ? null : visible, outcome };
}
