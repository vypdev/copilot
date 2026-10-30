import { journalFact, operationTransition, type JournalFact, type JournalKind, type OperationFact, type ProgressiveFact } from './journal_facts.ts';
import { deepFreeze } from './value.ts';
import { sameSessionFact, mergeSessionFact } from './session_fact.ts';
import { sameCollectionFact, mergeCollectionFact } from './collection_fact.ts';
import { sameClearFact, mergeClearFact } from './clear_fact.ts';
import { samePauseFact, mergePauseFact } from './pause_fact.ts';

export function snapshotJournalFact(kind: JournalKind, value: unknown): JournalFact | null {
    try {
        if (!journalFact(kind, value)) return null;
        const copied: unknown = JSON.parse(JSON.stringify(value));
        return journalFact(kind, copied) ? deepFreeze(copied) : null;
    } catch { return null; }
}
export function sameJournalFact(before: JournalFact, after: JournalFact): boolean {
    if (before.kind !== after.kind) return false;
    if (before.kind === 'session-operation' && after.kind === 'session-operation') return sameSessionFact(before, after);
    if (before.kind === 'collection-operation' && after.kind === 'collection-operation') return sameCollectionFact(before, after);
    if (before.kind === 'clear-operation' && after.kind === 'clear-operation') return sameClearFact(before, after);
    if (before.kind === 'pause-operation' && after.kind === 'pause-operation') return samePauseFact(before, after);
    return Object.keys(before).length === Object.keys(after).length
        && Object.entries(before).every(([key, value]) => after[key as keyof JournalFact] === value);
}
export function mergeProgressiveFact(before: ProgressiveFact, after: ProgressiveFact): ProgressiveFact | null {
    return before.kind === 'operation' && after.kind === 'operation' ? mergeOperationFact(before, after)
        : before.kind === 'session-operation' && after.kind === 'session-operation' ? mergeSessionFact(before, after)
            : before.kind === 'collection-operation' && after.kind === 'collection-operation' ? mergeCollectionFact(before, after)
                : before.kind === 'clear-operation' && after.kind === 'clear-operation' ? mergeClearFact(before, after)
                    : before.kind === 'pause-operation' && after.kind === 'pause-operation' ? mergePauseFact(before, after) : null;
}
export function nextStoredProgress(before: ProgressiveFact, desired: ProgressiveFact): ProgressiveFact {
    return before.kind === 'operation' && desired.kind === 'operation' ? nextStoredOperation(before, desired) : desired;
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
