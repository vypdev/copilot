import type { JournalKind } from './journal_facts.ts';

export interface CollectionRestrictionFact {
    readonly acknowledgement: 'not-attempted' | 'not-applied' | 'accepted' | 'unknown';
    readonly observation: 'paused' | 'active' | 'unavailable'; readonly policyRevision: number | null;
    readonly sourceCurrentAtObservation: boolean;
}
export interface CollectionState {
    readonly kind: JournalKind; readonly preference: 'on' | 'off' | 'unknown'; readonly globallyPaused: boolean | null;
    readonly policy: 'active' | 'paused' | 'future' | 'corrupt' | 'unavailable'; readonly policyRevision: number | null;
    readonly collecting: boolean; readonly sessionBlocked: boolean; readonly busy: boolean; readonly restriction: CollectionRestrictionFact | null;
}
export type JournalRetention = 'pending' | 'stored' | 'not-retained' | 'unknown' | 'untracked';
export type JournalWriterIssue = 'none' | 'not-ready' | 'capacity' | 'invalid' | 'clock-invalid' | 'stale' | 'unavailable' | 'unknown';
export interface JournalWriterState {
    readonly kind: JournalKind; readonly epoch: number | null; readonly observedRevision: number | null;
    readonly pending: number; readonly incomplete: boolean; readonly dropped: number; readonly issue: JournalWriterIssue;
}
