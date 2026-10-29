import type { JournalKind } from '../domain/journal_facts.ts';

/** In-process object identity only; no renderer API accepts or creates these tickets. */
export type JournalTicket = Readonly<object>;
export type { JournalRetention, JournalWriterIssue, JournalWriterState } from '../domain/history_state.ts';
export interface JournalWriterAdmission { readonly policyRevision: number; current(): boolean }
export interface JournalWriterPorts {
    now(): number;
    admission(kind: JournalKind): JournalWriterAdmission | null;
    /** Shared clear/activation reservation stops new native jobs, including deferred completions. */
    mayRun(kind: JournalKind): boolean;
    changed(): void;
}
