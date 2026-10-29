/** Deterministic native-request contract driver, not a claim about a browser's IndexedDB implementation. */
export class JournalNative {
    readonly opens: { name: string; version: number | undefined; request: IDBOpenDBRequest }[] = [];
    readonly transactions: JournalTransaction[] = [];
    readonly data = new Map<string, unknown>();
    readonly names = ['diagnostics', 'recents'];
    readonly created: string[] = [];
    closeCount = 0; version = 1;
    throwOpen = false; throwTransaction = false; throwCreate = false; throwAbort = false; throwClose = false;
    throwObjectStore = false; throwGet = false; throwPut = false;
    readonly factory: Pick<IDBFactory, 'open'> = { open: (name, version) => {
        if (this.throwOpen) throw new Error('native-private-error');
        const request = {} as IDBOpenDBRequest; this.opens.push({ name, version, request }); return request;
    } };
    readonly database = {
        get version() { return 1; },
        close: () => { this.closeCount++; if (this.throwClose) throw new Error('close-error'); },
        createObjectStore: (name: string) => { if (this.throwCreate) throw new Error('upgrade-error'); this.created.push(name); },
        transaction: (name: string, mode: string) => {
            if (this.throwTransaction) throw new Error('transaction-error');
            if (!this.names.includes(name) || mode !== 'readwrite') throw new Error('invalid-native-contract');
            const transaction = new JournalTransaction(this, name); this.transactions.push(transaction); return transaction.native;
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
    upgrade(transaction: { abort(): void }, index = 0): void {
        const request = this.opens[index].request;
        Object.defineProperties(request, { result: { configurable: true, value: this.database }, transaction: { configurable: true, value: transaction } });
        request.onupgradeneeded?.call(request, {} as IDBVersionChangeEvent);
    }
}

export class JournalTransaction {
    readonly reads: string[] = []; readonly puts: { key: string; value: unknown }[] = [];
    readonly request = {} as IDBRequest;
    aborted = false;
    readonly native: IDBTransaction;
    constructor(private readonly owner: JournalNative, readonly name: string) {
        this.native = {
            objectStore: (name: string) => {
                if (owner.throwObjectStore) throw new Error('object-store-error');
                if (name !== this.name) throw new Error('foreign-store');
                return {
                    get: (key: string) => {
                        if (owner.throwGet) throw new Error('get-error');
                        this.reads.push(key); return this.request;
                    },
                    put: (value: unknown, key: string) => {
                        if (owner.throwPut) throw new Error('put-error');
                        this.puts.push({ key, value: structuredClone(value) }); return {} as IDBRequest;
                    },
                };
            },
            abort: () => { if (owner.throwAbort) throw new Error('abort-error'); this.aborted = true; },
        } as unknown as IDBTransaction;
    }
    read(): void {
        Object.defineProperty(this.request, 'result', { configurable: true, value: structuredClone(this.owner.data.get(this.name)) });
        this.request.onsuccess?.call(this.request, {} as Event);
    }
    complete(): void {
        if (this.aborted) throw new Error('cannot-complete-aborted-transaction');
        for (const put of this.puts) {
            if (put.key !== 'current') throw new Error('foreign-key');
            this.owner.data.set(this.name, structuredClone(put.value));
        }
        this.native.oncomplete?.call(this.native, {} as Event);
    }
    rollback(): void { this.aborted = true; this.native.onabort?.call(this.native, {} as Event); }
    error(): void { this.native.onerror?.call(this.native, {} as Event); }
}
