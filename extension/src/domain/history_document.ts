import type { CollectionState, JournalWriterState } from './history_state.ts';
import type { JournalKind } from './journal_facts.ts';
import type { JournalSnapshot } from './local_journal.ts';

export type RetainedHistory = { readonly state: 'ready'; readonly snapshot: JournalSnapshot }
    | { readonly state: 'future' | 'corrupt' | 'clock-invalid' | 'exhausted' | 'unavailable' };
/** One collection per bounded response; existing history stays readable independently from authored preferences. */
export interface HistoryDocument {
    readonly state: 'ready'; readonly kind: JournalKind; readonly collection: CollectionState;
    readonly writer: JournalWriterState; readonly retained: RetainedHistory;
}
