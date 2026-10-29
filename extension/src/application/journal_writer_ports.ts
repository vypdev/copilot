import type { JournalKind } from '../domain/journal_facts.ts';

/** In-process object identity only; no renderer API accepts or creates these tickets. */
export type JournalTicket = Readonly<object>;
export type JournalRetention = 'pending' | 'stored' | 'not-retained' | 'unknown' | 'untracked';
export type JournalWriterIssue = 'none' | 'not-ready' | 'capacity' | 'invalid' | 'clock-invalid' | 'stale' | 'unavailable' | 'unknown';
export interface JournalWriterState {
    readonly kind: JournalKind; readonly epoch: number | null; readonly observedRevision: number | null;
    readonly pending: number; readonly incomplete: boolean; readonly dropped: number; readonly issue: JournalWriterIssue;
}
export interface JournalWriterAdmission { readonly policyRevision: number; current(): boolean }
export interface JournalWriterPorts {
    now(): number;
    admission(kind: JournalKind): JournalWriterAdmission | null;
    /** Shared clear/activation reservation stops new native jobs, including deferred completions. */
    mayRun(kind: JournalKind): boolean;
    changed(): void;
}
