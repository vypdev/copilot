type OpenFailure = { readonly state: 'future' } | { readonly state: 'unavailable'; readonly effect: 'not-started' };
const unavailable = (): OpenFailure => ({ state: 'unavailable', effect: 'not-started' });
const STORES = ['diagnostics', 'recents', 'policy'] as const;

export function closeJournalDatabase(database: IDBDatabase): void {
    try { database.close(); } catch { /* Connection cleanup cannot erase a terminal native fact. */ }
}
function layout(database: IDBDatabase, names: readonly string[]): boolean {
    return database.objectStoreNames.length === names.length && names.every(name => database.objectStoreNames.contains(name));
}

/** Known-v1 preservation upgrade only; no data deletion, arbitrary key or silent layout repair. */
export function openJournalDatabase(factory: Pick<IDBFactory, 'open'>): Promise<IDBDatabase | OpenFailure> {
    return new Promise(resolve => {
        let finished = false;
        const finish = (result: IDBDatabase | OpenFailure) => { if (!finished) { finished = true; resolve(result); } };
        const request = factory.open('copilot.generated-history.v1', 2);
        request.onblocked = () => { finish(unavailable()); };
        request.onerror = () => {
            try { finish(request.error?.name === 'VersionError' ? { state: 'future' } : unavailable()); }
            catch { finish(unavailable()); }
        };
        request.onupgradeneeded = event => {
            try {
                if (finished) throw new Error('retired-open');
                const database = request.result;
                if (event.oldVersion === 0 && layout(database, [])) {
                    for (const store of STORES) database.createObjectStore(store);
                } else if (event.oldVersion === 1 && layout(database, ['diagnostics', 'recents'])) {
                    database.createObjectStore('policy');
                } else throw new Error('unexpected-history-layout');
            } catch {
                try { request.transaction?.abort(); } catch { /* No journal/policy command was submitted. */ }
                finish(unavailable());
            }
        };
        request.onsuccess = () => {
            let database: IDBDatabase | undefined;
            try {
                database = request.result;
                if (finished) { closeJournalDatabase(database); return; }
                database.onversionchange = () => { closeJournalDatabase(database!); };
                if (database.version !== 2 || !layout(database, STORES)) {
                    closeJournalDatabase(database); finish(unavailable()); return;
                }
                finish(database);
            } catch { if (database) closeJournalDatabase(database); finish(unavailable()); }
        };
    });
}
