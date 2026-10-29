import type { JournalCommand, JournalResult } from '../domain/local_journal.ts';
import type { JournalKind } from '../domain/journal_facts.ts';

/** Background-owned transactional boundary. Never expose arbitrary recording commands to a renderer. */
export interface JournalStore {
    execute(kind: JournalKind, command: JournalCommand, eligible?: () => boolean, policyRevision?: number): Promise<JournalResult>;
}
