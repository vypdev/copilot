import type { CollectionInspection } from './collection_review.ts';
import type { JournalClearInspection } from './journal_clear.ts';
import type { HistoryFamily, HistoryPlan, HistoryReview, HistoryReviewPhase } from './history_client_view.ts';
import { decodeCollectionInspection, decodeCollectionOutcome } from './collection_reply.ts';
import { decodeJournalClearInspection, decodeJournalClearOutcome } from './journal_clear_reply.ts';

export type HistoryOutcome = CollectionInspection | JournalClearInspection;
export function historyOutcome(family: HistoryFamily, value: unknown, inspect = false): HistoryOutcome | null {
    return family === 'collection' ? inspect ? decodeCollectionInspection(value) : decodeCollectionOutcome(value)
        : inspect ? decodeJournalClearInspection(value) : decodeJournalClearOutcome(value);
}
export function historyOutcomeMatches(plan: HistoryPlan, value: HistoryOutcome): boolean {
    if (value.state === 'settled') return plan.family === 'collection' && value.kind === plan.plan.kind && value.action === plan.plan.action;
    if (value.state === 'observed-cleared') return plan.family === 'clear' && value.epoch === plan.plan.epoch + 1 && value.revision === plan.plan.revision + 1;
    return true;
}
export function publicHistoryReview(record: HistoryPlan, phase: HistoryReviewPhase, outcome: HistoryOutcome | null = null): HistoryReview {
    const { operationId: _id, state: _state, ...plan } = record.plan;
    return { family: record.family, plan, phase, outcome } as HistoryReview;
}
export const historyResultPhase = (value: HistoryOutcome | null): HistoryReviewPhase => !value || ['pending', 'not-submitted', 'unknown'].includes(value.state) ? 'unknown'
    : ['stale', 'expired', 'denied'].includes(value.state) ? 'stale' : 'result';
