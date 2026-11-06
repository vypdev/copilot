import type { BrowserApi } from '../adapters/browser/api.ts';
import { IndexedJournalStore } from '../adapters/browser/journal_store.ts';
import { IndexedCollectionPolicyStore } from '../adapters/browser/collection_policy_store.ts';
import { CollectionHistory } from '../application/collection_history.ts';
import type { StoragePort } from '../application/runtime_ports.ts';
import { centerIdentifier } from './center_runtime.ts';

/** No native factory/property access during listener registration; unavailable IDB cannot break primary settings. */
export function createHistory(api: BrowserApi, storage: StoragePort, changed: () => void) {
    const factory: Pick<IDBFactory, 'open'> = { open: (name, version) => {
        if (api.extension?.inIncognitoContext === true) throw new Error('history-unavailable');
        return globalThis.indexedDB.open(name, version);
    } };
    const policies = new IndexedCollectionPolicyStore(factory);
    return { policies, history: new CollectionHistory(storage, new IndexedJournalStore(factory), policies,
        { now: () => Date.now(), identifier: centerIdentifier, changed }) };
}
