import { decideJournal, JOURNAL_TTL, type JournalCommand, type JournalSnapshot } from '../../src/domain/local_journal.ts';
import type { JournalFact, JournalKind, OperationFact } from '../../src/domain/journal_facts.ts';

export const NOW = JOURNAL_TTL * 2;
export const reviewed: OperationFact = { kind: 'operation', action: 'preferences', phase: 'reviewed', acknowledgement: 'not-submitted', observation: 'not-observed' };
export const submitted: OperationFact = { ...reviewed, phase: 'submitted', acknowledgement: 'unknown' };
export const committed: OperationFact = { ...submitted, phase: 'settled', acknowledgement: 'accepted', observation: 'committed' };
export const helper: JournalFact = { kind: 'helper', helper: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' };
export const destination: JournalFact = { kind: 'destination', route: 'overview' };
export const append = (fact: JournalFact = reviewed, epoch = 0, now = NOW): Extract<JournalCommand, { type: 'append' }> => ({ type: 'append', epoch, at: now, now, fact });
export function saved(kind: JournalKind = 'diagnostics', fact: JournalFact = reviewed): JournalSnapshot {
    const decision = decideJournal(kind, undefined, append(fact));
    if (!decision.write) throw new Error('invalid-journal-fixture');
    return decision.write;
}
