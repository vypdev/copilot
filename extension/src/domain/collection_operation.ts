export type CollectionAction = 'start' | 'stop';
export const COLLECTION_REASONS = Object.freeze(['done', 'busy', 'stale', 'preference-unconfirmed', 'policy-unconfirmed', 'changed', 'unavailable'] as const);
export type CollectionReason = typeof COLLECTION_REASONS[number];
/** Shared closed phase vocabulary; independent from journals, native plans and current views. */
export interface CollectionPolicyFact {
    readonly acknowledgement: 'not-attempted' | 'not-applied' | 'accepted' | 'unknown';
    readonly observation: 'active' | 'paused' | 'unavailable'; readonly revision: number | null;
    readonly attributed: boolean;
}
