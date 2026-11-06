import { decodeHelperSample, EMPTY_HELPER_SAMPLE, type HelperSampleView } from '../domain/helper_sample_view.ts';
import { deepFreeze } from '../domain/value.ts';
import { collectionCurrent } from './collection_restrictions.ts';

export interface HelperSampleReaderPorts { request(): Promise<unknown>; eligible(): boolean; changed(): void }
/** One active native read; duplicate reads join it, source invalidation can request one fresh observation. */
export class HelperSampleReader {
    private value: HelperSampleView = EMPTY_HELPER_SAMPLE;
    private generation = 0;
    private activeGeneration = -1;
    private requested = false;
    private reading: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly ports: HelperSampleReaderPorts) {}
    get view(): HelperSampleView { return this.value; }
    private publish(): void { try { this.ports.changed(); } catch { /* Secondary UI failure cannot trigger a read or a primary operation. */ } }
    invalidate(): void {
        if (this.stopped) return;
        this.generation++; this.requested = false; this.value = EMPTY_HELPER_SAMPLE; this.publish();
    }
    read(): Promise<void> {
        if (this.stopped) return Promise.resolve();
        const eligible = collectionCurrent(this.ports.eligible); if (this.stopped) return Promise.resolve();
        if (!eligible) { this.invalidate(); return Promise.resolve(); }
        if (this.reading && (this.activeGeneration === this.generation || this.requested)) return this.reading;
        this.requested = true; this.value = deepFreeze({ phase: 'reading', value: null });
        this.reading ??= Promise.resolve().then(() => this.drain()); this.publish(); return this.reading;
    }
    private async drain(): Promise<void> {
        try {
            while (this.requested && !this.stopped) {
                this.requested = false; const generation = this.generation; this.activeGeneration = generation;
                if (!collectionCurrent(this.ports.eligible)) { if (!this.stopped) this.invalidate(); continue; }
                if (this.stopped) return;
                let result: unknown; try { result = await this.ports.request(); } catch { result = null; }
                if (this.stopped) return;
                if (generation !== this.generation) continue;
                const eligible = collectionCurrent(this.ports.eligible); if (this.stopped) return;
                if (generation !== this.generation) continue;
                if (!eligible) { this.invalidate(); continue; }
                const value = decodeHelperSample(result); if (this.stopped) return;
                if (generation !== this.generation) continue;
                if (!collectionCurrent(this.ports.eligible)) { if (!this.stopped) this.invalidate(); continue; }
                if (this.stopped || generation !== this.generation) continue;
                this.value = deepFreeze({ phase: value ? 'ready' : 'unavailable', value }); this.publish();
            }
        } finally { this.reading = null; }
    }
    stop(): void { this.stopped = true; this.generation++; this.requested = false; this.value = EMPTY_HELPER_SAMPLE; }
}
