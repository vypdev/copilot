import { journalFact, operationTransition, type JournalFact, type JournalKind, type OperationFact } from './journal_facts.ts';
import { deepFreeze } from './value.ts';

export function snapshotJournalFact(kind: JournalKind, value: unknown): JournalFact | null {
    try {
        if (!journalFact(kind, value)) return null;
        const copied: unknown = JSON.parse(JSON.stringify(value));
        return journalFact(kind, copied) ? deepFreeze(copied) : null;
    } catch { return null; }
}
export function sameJournalFact(before: JournalFact, after: JournalFact): boolean {
    return Object.keys(before).length === Object.keys(after).length
        && Object.entries(before).every(([key, value]) => after[key as keyof JournalFact] === value);
}
/** A later read cannot erase an acknowledgement or already established completion of this same operation. */
export function mergeOperationFact(before: OperationFact, after: OperationFact): OperationFact | null {
    if (before.action !== after.action) return null;
    if (before.phase === 'settled' && before.observation === 'committed') return before;
    const next = after.phase === 'settled' && before.acknowledgement === 'accepted' ? { ...after, acknowledgement: 'accepted' as const } : after;
    return sameJournalFact(before, next) ? before : operationTransition(before, next)
        || (before.phase === 'reviewed' && next.phase === 'settled') ? deepFreeze({ ...next }) : null;
}
/** A coalesced final observation proves submission, but cannot skip its required persisted transition. */
export function nextStoredOperation(before: OperationFact, desired: OperationFact): OperationFact {
    return before.phase === 'reviewed' && desired.phase === 'settled'
        ? Object.freeze({ kind: 'operation', action: before.action, phase: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' }) : desired;
}
