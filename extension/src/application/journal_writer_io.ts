import type { JournalFact, JournalKind, OperationFact } from '../domain/journal_facts.ts';
import { validJournalSnapshot, type JournalCommand, type JournalResult, type JournalSnapshot } from '../domain/local_journal.ts';
import { mergeOperationFact, nextStoredOperation, sameJournalFact } from '../domain/journal_progress.ts';
import type { JournalStore } from './journal_ports.ts';
import type { JournalRetention, JournalWriterAdmission, JournalWriterIssue } from './journal_writer_ports.ts';

export interface JournalWriteInput {
    readonly kind: JournalKind; readonly at: number; readonly epoch: number; readonly sequence: number | null;
    readonly desired: JournalFact; readonly stored: OperationFact | null; readonly needsRead: boolean;
    readonly authority: JournalWriterAdmission | null; readonly source: (() => boolean) | null;
}
export interface JournalWriteOutcome {
    readonly retention: Exclude<JournalRetention, 'pending' | 'untracked'>; readonly issue: JournalWriterIssue;
    readonly snapshot?: JournalSnapshot; readonly sequence?: number; readonly stored?: OperationFact;
    readonly needsRead?: boolean;
}
export interface JournalWriteControl { current(): boolean; now(): number | null }
interface OwnedRow { readonly snapshot: JournalSnapshot; readonly fact: OperationFact; readonly desired: OperationFact }
const failure = (issue: JournalWriterIssue, unknown = false): JournalWriteOutcome =>
    ({ retention: unknown ? 'unknown' : 'not-retained', issue, needsRead: unknown });
function safe(current: () => boolean): boolean { try { return current() === true; } catch { return false; } }
function snapshot(kind: JournalKind, result: JournalResult): JournalSnapshot | null {
    try { return 'snapshot' in result && validJournalSnapshot(kind, result.snapshot) ? result.snapshot : null; }
    catch { return null; }
}
async function readOwnedRow(input: JournalWriteInput, store: JournalStore, control: JournalWriteControl): Promise<JournalWriteOutcome | OwnedRow> {
    const now = control.now(); if (now === null) return failure('clock-invalid', true);
    let result: JournalResult;
    try { result = await store.execute(input.kind, { type: 'read', now }, () => safe(control.current)); }
    catch { return failure('unknown', true); }
    const value = snapshot(input.kind, result);
    if (!value) return failure('unknown', true);
    if (value.epoch !== input.epoch) return { ...failure('stale'), snapshot: value };
    const row = value.entries.find(entry => entry.sequence === input.sequence);
    if (!row || row.at !== input.at) return { ...failure('stale'), snapshot: value };
    if (row.fact.kind !== 'operation' || input.desired.kind !== 'operation' || row.fact.action !== input.desired.action) return failure('invalid', true);
    return { snapshot: value, fact: row.fact, desired: input.desired };
}
function observed(input: JournalWriteInput, read: OwnedRow): JournalWriteOutcome {
    const wanted = mergeOperationFact(read.fact, read.desired);
    return { retention: wanted && sameJournalFact(read.fact, wanted) ? 'stored' : 'not-retained',
        issue: wanted && sameJournalFact(read.fact, wanted) ? 'none' : 'unknown', snapshot: read.snapshot,
        sequence: input.sequence!, stored: read.fact, needsRead: false };
}

/** Unknown appends have no recoverable row identity. Known-row reread is observational, never an automatic write retry. */
export async function writeJournal(input: JournalWriteInput, store: JournalStore, control: JournalWriteControl): Promise<JournalWriteOutcome> {
    if (!safe(control.current)) return failure('stale');
    let stored = input.stored;
    if (input.needsRead && input.sequence !== null) {
        const read = await readOwnedRow(input, store, control); if ('retention' in read) return read;
        const wanted = mergeOperationFact(read.fact, read.desired);
        if (!wanted) return { ...failure('invalid'), snapshot: read.snapshot, stored: read.fact, sequence: input.sequence };
        if (sameJournalFact(read.fact, wanted)) return observed(input, read);
        stored = read.fact;
    }
    const now = control.now(); if (now === null) return failure('clock-invalid');
    let fact = input.desired;
    if (input.sequence !== null) {
        if (!stored || input.desired.kind !== 'operation') return failure('invalid');
        const wanted = mergeOperationFact(stored, input.desired); if (!wanted) return failure('invalid');
        fact = nextStoredOperation(stored, wanted);
    }
    const append = input.sequence === null;
    const guard = () => safe(control.current) && (!append || (input.authority !== null && safe(input.authority.current)
        && input.source !== null && safe(input.source)));
    if (!guard()) return failure('stale');
    const command: JournalCommand = append ? { type: 'append', epoch: input.epoch, at: input.at, fact, now }
        : { type: 'update', epoch: input.epoch, sequence: input.sequence!, fact: fact as OperationFact, now };
    let result: JournalResult;
    try { result = await store.execute(input.kind, command, guard, append ? input.authority!.policyRevision : undefined); }
    catch { result = { state: 'unavailable', effect: 'unknown' }; }
    if (result.state === 'unavailable' && result.effect === 'unknown') {
        if (append) return failure('unknown', true);
        const read = await readOwnedRow(input, store, control); return 'retention' in read ? read : observed(input, read);
    }
    if (result.state !== 'written' && (!append && result.state !== 'unchanged' || append)) {
        return failure(result.state === 'stale' || result.state === 'clock-invalid' ? result.state : 'unavailable');
    }
    const value = snapshot(input.kind, result); const sequence = 'sequence' in result ? result.sequence : undefined;
    const row = value?.entries.find(entry => entry.sequence === sequence);
    if (!value || value.epoch !== input.epoch || !row || row.at !== input.at || !sameJournalFact(row.fact, fact)
        || (input.sequence !== null && sequence !== input.sequence)) return failure('invalid', true);
    return { retention: 'stored', issue: 'none', snapshot: value, sequence,
        ...(row.fact.kind === 'operation' ? { stored: row.fact } : {}), needsRead: false };
}
