import { decodeCurrentOperation, EMPTY_CURRENT_OPERATION, type CurrentOperationView } from '../domain/current_operation.ts';
import { deepFreeze } from '../domain/value.ts';
import { collectionCurrent } from './collection_restrictions.ts';

export interface CurrentOperationReaderPorts { request(): Promise<unknown>; eligible(): boolean; changed(): void }
/** Metadata-only, one active request and one coalesced refresh. Invalidation immediately removes private target detail. */
export class CurrentOperationReader {
    private value: CurrentOperationView = EMPTY_CURRENT_OPERATION;
    private generation = 0;
    private requested = false;
    private reading: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly ports: CurrentOperationReaderPorts) {}
    get view(): CurrentOperationView { return this.value; }
    /** Callers validate lifetime after every external boundary before changing or publishing state. */
    private publish(): void { try { this.ports.changed(); } catch { /* A renderer cannot poison primary operations. */ } }
    private redact(): void {
        const value = this.value.value;
        this.value = deepFreeze({ ...this.value, current: false, value: value?.state === 'current'
            ? { state: 'current', operation: { ...value.operation, sourceCurrent: false, target: null } } : value });
    }
    invalidate(): void { if (!this.stopped) { this.generation++; this.requested = false; this.redact(); this.value = deepFreeze({ ...this.value, phase: 'idle' }); this.publish(); } }
    clear(): void { if (!this.stopped) { this.generation++; this.requested = false; this.value = EMPTY_CURRENT_OPERATION; this.publish(); } }
    read(): Promise<void> {
        if (this.stopped) return Promise.resolve();
        const eligible = collectionCurrent(this.ports.eligible); if (this.stopped) return Promise.resolve();
        if (!eligible) { this.invalidate(); return Promise.resolve(); }
        this.requested = true; this.redact(); this.value = deepFreeze({ ...this.value, phase: 'reading' });
        this.reading ??= Promise.resolve().then(() => this.drain()); this.publish(); return this.reading;
    }
    private async drain(): Promise<void> {
        try {
            while (this.requested && !this.stopped) {
                this.requested = false; const generation = this.generation;
                const eligible = collectionCurrent(this.ports.eligible); if (this.stopped) return;
                if (!eligible) { this.invalidate(); continue; }
                let body: unknown; try { body = await this.ports.request(); } catch { body = null; }
                if (this.stopped) return;
                if (generation !== this.generation) continue;
                const current = collectionCurrent(this.ports.eligible); if (this.stopped) return;
                if (!current) { this.invalidate(); continue; }
                const value = decodeCurrentOperation(body);
                if (this.stopped) return;
                if (generation !== this.generation) continue;
                const publishable = collectionCurrent(this.ports.eligible); if (this.stopped) return;
                if (generation !== this.generation) continue;
                if (!publishable) { this.invalidate(); continue; }
                this.value = deepFreeze({ phase: value ? 'ready' : 'unavailable', current: value !== null, value: value ?? this.value.value });
                this.publish();
            }
        } finally { this.reading = null; }
    }
    stop(): void { this.stopped = true; this.requested = false; this.generation++; this.value = EMPTY_CURRENT_OPERATION; }
}
