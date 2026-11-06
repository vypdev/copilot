import type { JournalKind } from './journal_facts.ts';
import type { JournalClearIssue } from './clear_operation.ts';
export type { JournalClearIssue } from './clear_operation.ts';

export type JournalClearPreview = { readonly state: 'preview'; readonly operationId: string; readonly kind: JournalKind;
    readonly epoch: number; readonly revision: number; readonly policyRevision: number; readonly entries: number; readonly expiresAt: number }
    | { readonly state: JournalClearIssue };
export type JournalClearOutcome = { readonly state: 'observed-cleared'; readonly acknowledgement: 'accepted' | 'unknown';
    readonly epoch: number; readonly revision: number; readonly sourceCurrentAtObservation: boolean }
    | { readonly state: 'unknown'; readonly acknowledgement: 'accepted' | 'unknown';
        readonly observation: 'changed' | 'unavailable'; readonly sourceCurrentAtObservation: boolean }
    | { readonly state: 'not-applied'; readonly reason: 'not-started' | 'aborted' }
    | { readonly state: JournalClearIssue | 'cancelled' | 'pending' };
export type JournalClearInspection = JournalClearOutcome | { readonly state: 'not-submitted' };
