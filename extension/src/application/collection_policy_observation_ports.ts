import type { CollectionPolicyFact } from '../domain/collection_review.ts';
import type { JournalKind } from '../domain/journal_facts.ts';

/** Per invocation, secondary only; selectors and raw policy records never enter this port. */
export interface CollectionPolicyTrace { submitted(): void; observed(fact: CollectionPolicyFact): void }
export type ObserveCollectionPolicy = (kind: JournalKind) => CollectionPolicyTrace | null;
export function reportPolicySubmission(trace: CollectionPolicyTrace | null | undefined): void {
    try { trace?.submitted(); } catch { /* Native submission has already happened. */ }
}
export function reportPolicyObservation(trace: CollectionPolicyTrace | null | undefined, value: CollectionPolicyFact): void {
    try { trace?.observed(Object.freeze({ acknowledgement: value.acknowledgement, observation: value.observation,
        revision: value.revision, attributed: value.attributed })); } catch { /* Secondary observers cannot replace primary facts. */ }
}
export function observePolicy(observe: ObserveCollectionPolicy | undefined, kind: JournalKind): CollectionPolicyTrace | null {
    try { return observe?.(kind) ?? null; } catch { return null; }
}
