import { loadCollectionPolicy } from './collection_policy.ts';
import { decideJournal, validJournalCommand, type JournalCommand, type JournalDecision } from './local_journal.ts';
import type { JournalKind } from './journal_facts.ts';
import { natural } from './value.ts';

export function validJournalAdmission(kind: unknown, command: unknown, policyRevision: unknown): command is JournalCommand {
    return validJournalCommand(kind, command) && (command.type === 'append' || command.type === 'clear'
        ? natural(policyRevision) : policyRevision === undefined);
}

/** Journal generation and policy revision are read/checked in the same native transaction. */
export function decideControlledJournal(kind: JournalKind, journal: unknown, rawPolicy: unknown, command: JournalCommand,
    policyRevision?: number): JournalDecision {
    try { return controlled(kind, journal, rawPolicy, command, policyRevision); }
    catch { return { result: { state: 'invalid' } }; }
}
function controlled(kind: JournalKind, journal: unknown, rawPolicy: unknown, command: JournalCommand, policyRevision?: number): JournalDecision {
    if (!validJournalAdmission(kind, command, policyRevision)) return { result: { state: 'invalid' } };
    if (command.type === 'read') return decideJournal(kind, journal, command);
    const loaded = loadCollectionPolicy(kind, rawPolicy);
    if (loaded.state !== 'ready') return { result: loaded };
    if (command.type === 'append') {
        if (loaded.policy.mode !== 'active') return { result: { state: 'collection-inactive' } };
        if (loaded.policy.revision !== policyRevision) return { result: { state: 'stale' } };
        // Capture cannot rely on an active policy whose revision can no longer be advanced to stop it.
        if (!natural(loaded.policy.revision + 1)) return { result: { state: 'exhausted' } };
    } else if (command.type === 'clear') {
        if (loaded.policy.mode !== 'paused') return { result: { state: 'collection-active' } };
        if (loaded.policy.revision !== policyRevision) return { result: { state: 'stale' } };
    }
    return decideJournal(kind, journal, command);
}
