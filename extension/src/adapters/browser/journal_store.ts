import type { JournalStore } from '../../application/journal_ports.ts';
import type { JournalCommand, JournalResult } from '../../domain/local_journal.ts';
import { decideControlledJournal, validJournalAdmission } from '../../domain/controlled_journal.ts';
import type { JournalKind } from '../../domain/journal_facts.ts';
import { closeJournalDatabase, openJournalDatabase } from './journal_database.ts';

const KEY = 'current';
const unavailable = (effect: 'not-started' | 'aborted' | 'unknown'): JournalResult => ({ state: 'unavailable', effect });

/** Fixed native transactions, with no promise boundary between reading and queueing the decision's write. */
export class IndexedJournalStore implements JournalStore {
    constructor(private readonly factory: Pick<IDBFactory, 'open'>) {}
    async execute(kind: JournalKind, command: JournalCommand, eligible?: () => boolean, policyRevision?: number): Promise<JournalResult> {
        try {
            if (!validJournalAdmission(kind, command, policyRevision)) return { state: 'invalid' };
            // Native request payloads must not keep mutable application references across open().
            const captured = JSON.parse(JSON.stringify(command)) as JournalCommand;
            if (!validJournalAdmission(kind, captured, policyRevision)) return { state: 'invalid' };
            const current = () => { try { return eligible === undefined ? captured.type === 'read' : eligible() === true; } catch { return false; } };
            if (!current()) return { state: 'stale' };
            const opened = await openJournalDatabase(this.factory);
            if (!('transaction' in opened)) return opened;
            try { return current() ? await this.transact(opened, kind, captured, current, policyRevision) : { state: 'stale' }; } finally { closeJournalDatabase(opened); }
        } catch { return unavailable('not-started'); }
    }
    private transact(database: IDBDatabase, kind: JournalKind, command: JournalCommand, current: () => boolean, policyRevision?: number): Promise<JournalResult> {
        return new Promise(resolve => {
            let result: JournalResult = unavailable('unknown'); let transaction: IDBTransaction;
            try { transaction = database.transaction([kind, 'policy'], 'readwrite'); }
            catch { resolve(unavailable('not-started')); return; }
            transaction.oncomplete = () => { resolve(result); };
            transaction.onabort = () => { resolve(unavailable('aborted')); };
            // A bubbled request error precedes rollback; only the terminal transaction event settles the promise.
            transaction.onerror = () => {};
            const abort = () => {
                try { transaction.abort(); } catch { resolve(unavailable('unknown')); }
            };
            try {
                const store = transaction.objectStore(kind); const request = store.get(KEY);
                const policy = transaction.objectStore('policy').get(kind);
                let journalRead = false; let policyRead = false; let decided = false; let journalValue: unknown; let policyValue: unknown;
                const decide = () => {
                    try {
                        if (decided || !journalRead || !policyRead) return;
                        decided = true;
                        if (!current()) { result = { state: 'stale' }; return; }
                        const decision = decideControlledJournal(kind, journalValue, policyValue, command, policyRevision);
                        result = decision.result;
                        if (decision.write) store.put(decision.write, KEY);
                    } catch { abort(); }
                };
                request.onsuccess = () => { try { journalValue = request.result; journalRead = true; decide(); } catch { abort(); } };
                policy.onsuccess = () => { try { policyValue = policy.result; policyRead = true; decide(); } catch { abort(); } };
            } catch { abort(); }
        });
    }
}
