import type { CollectionMode } from './collection_policy.ts';
import type { JournalKind } from './journal_facts.ts';
import type { SettingsCommit } from './settings_result.ts';
import type { CollectionAction, CollectionPolicyFact, CollectionReason } from './collection_operation.ts';
export type { CollectionAction, CollectionPolicyFact } from './collection_operation.ts';

export type CollectionReviewIssue = 'invalid' | 'denied' | 'stale' | 'expired' | 'unavailable' | 'busy'
    | 'future' | 'corrupt' | 'migration-required' | 'conflict' | 'globally-paused' | 'pause-unconfirmed' | 'exhausted';
export type CollectionPreview = { readonly state: 'preview'; readonly operationId: string; readonly kind: JournalKind;
    readonly action: CollectionAction; readonly settingsRevision: number; readonly policyRevision: number | null;
    readonly preferenceBefore: boolean; readonly preferenceAfter: boolean; readonly policyBefore: CollectionMode | 'unknown';
    readonly policyAfter: CollectionMode; readonly expiresAt: number }
    | { readonly state: CollectionReviewIssue | 'unchanged' };
export interface CollectionSettled {
    readonly state: 'settled'; readonly action: CollectionAction; readonly kind: JournalKind;
    readonly reason: CollectionReason;
    readonly preference: SettingsCommit | { readonly state: 'not-attempted' | 'already'; readonly revision: number };
    readonly observedPreference: { readonly enabled: boolean; readonly revision: number } | null;
    readonly preferenceVerifiedAtObservation: boolean;
    readonly policy: CollectionPolicyFact; readonly admittedAtObservation: boolean; readonly sourceCurrentAtObservation: boolean;
}
export type CollectionOutcome = CollectionSettled | { readonly state: CollectionReviewIssue | 'cancelled' | 'pending' };
/** A retained-owner observation, not proof that an earlier IPC request cannot still arrive. */
export type CollectionInspection = CollectionOutcome | { readonly state: 'not-submitted' };
