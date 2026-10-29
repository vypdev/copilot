import { journalFact, journalKind, operationTransition, type JournalFact, type JournalKind, type OperationFact } from './journal_facts.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

export const JOURNAL_TTL = 7 * 24 * 60 * 60 * 1000;
export const JOURNAL_LIMITS = Object.freeze({ diagnostics: 200, recents: 50 });
export interface JournalEntry { readonly sequence: number; readonly at: number; readonly fact: JournalFact }
export interface JournalSnapshot {
    readonly schemaVersion: 1; readonly kind: JournalKind; readonly epoch: number; readonly revision: number;
    readonly nextSequence: number; readonly lastTime: number; readonly entries: readonly JournalEntry[];
}
export type JournalCommand = { readonly type: 'read'; readonly now: number }
    | { readonly type: 'append'; readonly now: number; readonly epoch: number; readonly at: number; readonly fact: JournalFact }
    | { readonly type: 'update'; readonly now: number; readonly epoch: number; readonly sequence: number; readonly fact: OperationFact }
    | { readonly type: 'clear'; readonly now: number; readonly epoch: number; readonly revision: number };
export type JournalResult = { readonly state: 'ready' | 'written' | 'unchanged'; readonly snapshot: JournalSnapshot; readonly sequence?: number }
    | { readonly state: 'stale' | 'invalid' | 'future' | 'corrupt' | 'clock-invalid' | 'exhausted' | 'collection-active' | 'collection-inactive' }
    | { readonly state: 'unavailable'; readonly effect: 'not-started' | 'aborted' | 'unknown' };
export interface JournalDecision { readonly result: JournalResult; readonly write?: JournalSnapshot }

export function validJournalCommand(kind: unknown, value: unknown): value is JournalCommand {
    if (!journalKind(kind) || !record(value) || !natural(value.now)) return false;
    if (value.type === 'read') return keys(value, ['type', 'now']) && Object.keys(value).length === 2;
    if (!natural(value.epoch)) return false;
    if (value.type === 'clear') return keys(value, ['type', 'now', 'epoch', 'revision'])
        && Object.keys(value).length === 4 && natural(value.revision);
    if (value.type === 'append') return keys(value, ['type', 'now', 'epoch', 'at', 'fact']) && Object.keys(value).length === 5
        && natural(value.at) && journalFact(kind, value.fact);
    return value.type === 'update' && kind === 'diagnostics' && keys(value, ['type', 'now', 'epoch', 'sequence', 'fact'])
        && Object.keys(value).length === 5 && natural(value.sequence) && value.sequence > 0
        && journalFact(kind, value.fact) && value.fact.kind === 'operation';
}
export function validJournalSnapshot(kind: JournalKind, value: unknown): value is JournalSnapshot {
    if (!record(value) || !keys(value, ['schemaVersion', 'kind', 'epoch', 'revision', 'nextSequence', 'lastTime', 'entries'])
        || Object.keys(value).length !== 7 || value.schemaVersion !== 1 || value.kind !== kind || !natural(value.epoch)
        || !natural(value.revision) || value.epoch > value.revision || !natural(value.nextSequence) || value.nextSequence === 0
        || !natural(value.lastTime) || !Array.isArray(value.entries) || value.entries.length > JOURNAL_LIMITS[kind]
        || !jsonBytesWithin(value, 65536)) return false;
    let prior = 0;
    return [...value.entries].every(entry => {
        if (!record(entry) || !keys(entry, ['sequence', 'at', 'fact']) || Object.keys(entry).length !== 3
            || !natural(entry.sequence) || entry.sequence <= prior || entry.sequence >= (value.nextSequence as number)
            || !natural(entry.at) || entry.at > (value.lastTime as number) || !journalFact(kind, entry.fact)) return false;
        prior = entry.sequence; return true;
    });
}

/** Synchronous transaction decision; the caller commits the returned envelope atomically. */
export function decideJournal(kind: JournalKind, raw: unknown, command: JournalCommand): JournalDecision {
    try { return decide(kind, raw, command); } catch { return { result: { state: 'corrupt' } }; }
}
function decide(kind: JournalKind, raw: unknown, input: JournalCommand): JournalDecision {
    if (!validJournalCommand(kind, input)) return { result: { state: 'invalid' } };
    if (record(raw) && natural(raw.schemaVersion) && raw.schemaVersion > 1) return { result: { state: 'future' } };
    if (raw !== undefined && !validJournalSnapshot(kind, raw)) return { result: { state: 'corrupt' } };
    const before: JournalSnapshot = raw === undefined
        ? { schemaVersion: 1, kind, epoch: 0, revision: 0, nextSequence: 1, lastTime: 0, entries: [] }
        : JSON.parse(JSON.stringify(raw)) as JournalSnapshot;
    if (input.now < before.lastTime) return { result: { state: 'clock-invalid' } };
    if (input.type !== 'read' && (input.epoch !== before.epoch
        || (input.type === 'clear' && input.revision !== before.revision))) return { result: { state: 'stale' } };
    let entries = before.entries.filter(entry => input.now - entry.at < JOURNAL_TTL);
    let nextSequence = before.nextSequence; let epoch = before.epoch; let sequence: number | undefined; let identical = false;
    if (input.type === 'append') {
        if (input.at > input.now || input.now - input.at >= JOURNAL_TTL) return { result: { state: 'stale' } };
        sequence = nextSequence++;
        entries = [...entries, { sequence, at: input.at, fact: input.fact }].slice(-JOURNAL_LIMITS[kind]);
    } else if (input.type === 'update') {
        const index = entries.findIndex(entry => entry.sequence === input.sequence);
        if (index < 0) return { result: { state: 'stale' } };
        const prior = entries[index];
        if (prior.fact.kind !== 'operation') return { result: { state: 'invalid' } };
        // Exact semantic field comparison does not depend on caller property insertion order.
        const same = Object.entries(prior.fact).every(([key, value]) => input.fact[key as keyof OperationFact] === value);
        identical = same;
        if (!same && !operationTransition(prior.fact, input.fact)) return { result: { state: 'invalid' } };
        sequence = prior.sequence; entries[index] = { ...prior, fact: input.fact };
    } else if (input.type === 'clear') { epoch++; nextSequence = 1; entries = []; }
    const changed = (input.type !== 'read' && !identical) || entries.length !== before.entries.length;
    if (!changed) return { result: { state: identical ? 'unchanged' : 'ready', snapshot: deepFreeze(before), ...(sequence === undefined ? {} : { sequence }) } };
    const next = { ...before, epoch, revision: before.revision + 1, nextSequence, lastTime: input.now, entries };
    if (!natural(next.revision) || !natural(epoch) || !natural(nextSequence)) return { result: { state: 'exhausted' } };
    if (!validJournalSnapshot(kind, next)) return { result: { state: 'invalid' } };
    const snapshot = deepFreeze(JSON.parse(JSON.stringify(next)) as JournalSnapshot);
    return { result: { state: input.type === 'read' ? 'ready' : 'written', snapshot, ...(sequence === undefined ? {} : { sequence }) }, write: snapshot };
}
