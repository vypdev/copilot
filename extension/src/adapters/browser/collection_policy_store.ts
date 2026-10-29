import type { CollectionPolicyStore } from '../../application/collection_policy_ports.ts';
import { decideCollectionPolicy, validCollectionPolicyCommand, type CollectionPolicyCommand, type CollectionPolicyResult } from '../../domain/collection_policy.ts';
import type { JournalKind } from '../../domain/journal_facts.ts';
import { closeJournalDatabase, openJournalDatabase } from './journal_database.ts';

const unavailable = (effect: 'not-started' | 'aborted' | 'unknown'): CollectionPolicyResult => ({ state: 'unavailable', effect });

/** Native policy receipts acknowledge only terminal transactions; observations remain separate reads. */
export class IndexedCollectionPolicyStore implements CollectionPolicyStore {
    constructor(private readonly factory: Pick<IDBFactory, 'open'>) {}
    async execute(kind: JournalKind, command: CollectionPolicyCommand, eligible?: () => boolean): Promise<CollectionPolicyResult> {
        try {
            if (!validCollectionPolicyCommand(kind, command)) return { state: 'invalid' };
            const captured = JSON.parse(JSON.stringify(command)) as CollectionPolicyCommand;
            if (!validCollectionPolicyCommand(kind, captured)) return { state: 'invalid' };
            const current = () => { try { return eligible === undefined ? captured.type === 'read' : eligible() === true; } catch { return false; } };
            if (!current()) return { state: 'stale' };
            const opened = await openJournalDatabase(this.factory);
            if (!('transaction' in opened)) return opened;
            try { return current() ? await this.transact(opened, kind, captured, current) : { state: 'stale' }; }
            finally { closeJournalDatabase(opened); }
        } catch { return unavailable('not-started'); }
    }
    private transact(database: IDBDatabase, kind: JournalKind, command: CollectionPolicyCommand, current: () => boolean): Promise<CollectionPolicyResult> {
        return new Promise(resolve => {
            let result: CollectionPolicyResult = unavailable('unknown'); let transaction: IDBTransaction;
            try { transaction = database.transaction('policy', 'readwrite'); }
            catch { resolve(unavailable('not-started')); return; }
            transaction.oncomplete = () => { resolve(result); };
            transaction.onabort = () => { resolve(unavailable('aborted')); };
            transaction.onerror = () => {};
            const abort = () => { try { transaction.abort(); } catch { resolve(unavailable('unknown')); } };
            try {
                const store = transaction.objectStore('policy'); const request = store.get(kind);
                request.onsuccess = () => {
                    try {
                        if (!current()) { result = { state: 'stale' }; return; }
                        const decision = decideCollectionPolicy(kind, request.result, command); result = decision.result;
                        if (decision.write) store.put(decision.write, kind);
                    } catch { abort(); }
                };
            } catch { abort(); }
        });
    }
}
