/** Deterministic native-request contract driver, not a claim about a browser's IndexedDB implementation. */
export class JournalNative {
    readonly opens: { name: string; version: number | undefined; request: IDBOpenDBRequest }[] = [];
    readonly transactions: JournalTransaction[] = [];
    readonly data = new Map<string, unknown>();
    readonly names = ['diagnostics', 'recents', 'policy'];
    readonly created: string[] = [];
    readonly deletions: string[] = [];
    closeCount = 0; version = 2;
    throwOpen = false; throwTransaction = false; throwCreate = false; throwAbort = false; throwClose = false;
    throwObjectStore = false; throwGet = false; throwPut = false;
    readonly factory: Pick<IDBFactory, 'open'> = { open: (name, version) => {
        if (this.throwOpen) throw new Error('native-private-error');
        const request = {} as IDBOpenDBRequest; this.opens.push({ name, version, request }); return request;
    } };
    readonly database = {
        get version() { return 1; },
        close: () => { this.closeCount++; if (this.throwClose) throw new Error('close-error'); },
        createObjectStore: (name: string) => {
            if (this.throwCreate || this.names.includes(name)) throw new Error('upgrade-error');
            this.created.push(name); this.names.push(name);
        },
        deleteObjectStore: (name: string) => { this.deletions.push(name); throw new Error('forbidden-store-deletion'); },
        transaction: (input: string | string[], mode: string) => {
            if (this.throwTransaction) throw new Error('transaction-error');
            const names = typeof input === 'string' ? [input] : [...input];
            if (!names.length || !names.every(name => this.names.includes(name)) || mode !== 'readwrite') throw new Error('invalid-native-contract');
            const transaction = new JournalTransaction(this, names); this.transactions.push(transaction); return transaction.native;
        },
    } as unknown as IDBDatabase;
    constructor() {
        Object.defineProperties(this.database, {
            version: { get: () => this.version },
            objectStoreNames: { get: () => ({ length: this.names.length, contains: (name: string) => this.names.includes(name) }) },
        });
    }
    opened(index = 0): void {
        const request = this.opens[index].request;
        Object.defineProperty(request, 'result', { configurable: true, value: this.database });
        request.onsuccess?.call(request, {} as Event);
    }
    failed(name = 'UnknownError', index = 0): void {
        const request = this.opens[index].request;
        Object.defineProperty(request, 'error', { configurable: true, value: { name } });
        request.onerror?.call(request, {} as Event);
    }
    blocked(index = 0): void { const request = this.opens[index].request; request.onblocked?.call(request, {} as IDBVersionChangeEvent); }
    upgrade(transaction: { abort(): void }, index = 0, oldVersion = 0): void {
        const request = this.opens[index].request;
        Object.defineProperties(request, { result: { configurable: true, value: this.database }, transaction: { configurable: true, value: transaction } });
        request.onupgradeneeded?.call(request, { oldVersion } as IDBVersionChangeEvent);
    }
}

export class JournalTransaction {
    readonly reads: string[] = []; readonly puts: { store: string; key: string; value: unknown }[] = [];
    readonly request = {} as IDBRequest;
    readonly requests: { store: string; key: string; request: IDBRequest }[] = [];
    aborted = false;
    readonly native: IDBTransaction;
    readonly name: string;
    constructor(private readonly owner: JournalNative, readonly names: readonly string[]) {
        this.name = names[0];
        this.native = {
            objectStore: (name: string) => {
                if (owner.throwObjectStore) throw new Error('object-store-error');
                if (!this.names.includes(name)) throw new Error('foreign-store');
                return {
                    get: (key: string) => {
                        if (owner.throwGet) throw new Error('get-error');
                        this.reads.push(key); const request = this.requests.length ? {} as IDBRequest : this.request;
                        this.requests.push({ store: name, key, request }); return request;
                    },
                    put: (value: unknown, key: string) => {
                        if (owner.throwPut) throw new Error('put-error');
                        this.puts.push({ store: name, key, value: structuredClone(value) }); return {} as IDBRequest;
                    },
                };
            },
            abort: () => { if (owner.throwAbort) throw new Error('abort-error'); this.aborted = true; },
        } as unknown as IDBTransaction;
    }
    read(): void {
        for (const name of this.names) this.readStore(name);
    }
    readStore(name: string): void {
        for (const { store, key, request } of this.requests.filter(item => item.store === name)) {
            const nativeKey = store === 'policy' ? `policy:${key}` : store;
            Object.defineProperty(request, 'result', { configurable: true, value: structuredClone(this.owner.data.get(nativeKey)) });
            request.onsuccess?.call(request, {} as Event);
        }
    }
    complete(): void {
        if (this.aborted) throw new Error('cannot-complete-aborted-transaction');
        for (const put of this.puts) {
            if (put.store !== 'policy' && put.key !== 'current') throw new Error('foreign-key');
            this.owner.data.set(put.store === 'policy' ? `policy:${put.key}` : put.store, structuredClone(put.value));
        }
        this.native.oncomplete?.call(this.native, {} as Event);
    }
    rollback(): void { this.aborted = true; this.native.onabort?.call(this.native, {} as Event); }
    error(): void { this.native.onerror?.call(this.native, {} as Event); }
}
