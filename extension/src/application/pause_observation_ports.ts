import type { PauseReviewIntent, PauseReviewOutcome } from '../domain/temporary_pause_review.ts';
import type { ProtectedMutationTrace } from './protected_mutation.ts';

export interface PauseOperationTrace extends ProtectedMutationTrace {
    acknowledged(value: 'accepted' | 'unknown'): void;
    confirming(): void; cancelled(): void; complete(result: PauseReviewOutcome): void;
}
export type ObservePauseOperation = (owner: string, intent: PauseReviewIntent, current: () => boolean) => PauseOperationTrace | null;
export function reportPause(trace: PauseOperationTrace | null | undefined, event: 'confirming' | 'cancelled'): void {
    try { trace?.[event](); } catch { /* Observation cannot confirm, cancel or repeat the native effect. */ }
}
export function completePause(trace: PauseOperationTrace | null | undefined, result: PauseReviewOutcome): void {
    try { trace?.complete(Object.freeze({ ...result })); } catch { /* Primary facts and publication checks remain independent. */ }
}
