import type { JournalStore } from '../../application/journal_ports.ts';
import { decideJournal, validJournalCommand, type JournalCommand, type JournalResult } from '../../domain/local_journal.ts';
import type { JournalKind } from '../../domain/journal_facts.ts';

const DATABASE = 'copilot.generated-history.v1';
const STORES = ['diagnostics', 'recents'] as const;
const KEY = 'current';
const unavailable = (effect: 'not-started' | 'aborted' | 'unknown'): JournalResult => ({ state: 'unavailable', effect });
const close = (database: IDBDatabase): void => { try { database.close(); } catch { /* Cleanup cannot erase a terminal transaction fact. */ } };

/** Fixed native transactions, with no promise boundary between reading and queueing the decision's write. */
export class IndexedJournalStore implements JournalStore {
    constructor(private readonly factory: Pick<IDBFactory, 'open'>) {}
    async execute(kind: JournalKind, command: JournalCommand): Promise<JournalResult> {
        try {
            if (!validJournalCommand(kind, command)) return { state: 'invalid' };
            // Native request payloads must not keep mutable application references across open().
            const captured = JSON.parse(JSON.stringify(command)) as JournalCommand;
            const opened = await this.open();
            if (!('transaction' in opened)) return opened;
            try { return await this.transact(opened, kind, captured); } finally { close(opened); }
        } catch { return unavailable('not-started'); }
    }
    private open(): Promise<IDBDatabase | JournalResult> {
        return new Promise(resolve => {
            let finished = false;
            const finish = (result: IDBDatabase | JournalResult) => { if (!finished) { finished = true; resolve(result); } };
            const request = this.factory.open(DATABASE, 1);
            request.onblocked = () => { finish(unavailable('not-started')); };
            request.onerror = () => { finish(request.error?.name === 'VersionError' ? { state: 'future' } : unavailable('not-started')); };
            request.onupgradeneeded = () => {
                try {
                    for (const store of STORES) request.result.createObjectStore(store);
                } catch {
                    // An unexpected layout is preserved, never deleted/recreated as a fallback.
                    try { request.transaction?.abort(); } catch { /* No journal write was submitted. */ }
                    finish(unavailable('not-started'));
                }
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => { close(database); };
                if (finished) { close(database); return; }
                if (database.version !== 1 || database.objectStoreNames.length !== 2
                    || !STORES.every(name => database.objectStoreNames.contains(name))) {
                    close(database); finish(unavailable('not-started')); return;
                }
                finish(database);
            };
        });
    }
    private transact(database: IDBDatabase, kind: JournalKind, command: JournalCommand): Promise<JournalResult> {
        return new Promise(resolve => {
            let result: JournalResult = unavailable('unknown'); let transaction: IDBTransaction;
            try { transaction = database.transaction(kind, 'readwrite'); }
            catch { resolve(unavailable('not-started')); return; }
            transaction.oncomplete = () => { resolve(result); };
            transaction.onabort = () => { resolve(unavailable('aborted')); };
            // A bubbled request error precedes rollback; only the terminal transaction event settles the promise.
            transaction.onerror = () => {};
            const abort = () => {
                try { transaction.abort(); } catch { resolve(unavailable('unknown')); }
            };
            try {
                const store = transaction.objectStore(kind);
                const request = store.get(KEY);
                request.onsuccess = () => {
                    try {
                        const decision = decideJournal(kind, request.result, command);
                        result = decision.result;
                        if (decision.write) store.put(decision.write, KEY);
                    } catch { abort(); }
                };
            } catch { abort(); }
        });
    }
}
