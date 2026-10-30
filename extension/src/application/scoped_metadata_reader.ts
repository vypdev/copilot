import { EMPTY_METADATA_READ, type MetadataReadView } from '../domain/metadata_read_view.ts';
import { deepFreeze, natural } from '../domain/value.ts';

export interface ScopedMetadataPorts<T> {
    request(): Promise<unknown>; decode(value: unknown): T | null; revision(value: T): number | null;
    canRead(): boolean; changed(): void;
}
/** One native metadata request and one coalesced trailing request. Metadata cannot replay or certify effects. */
export class ScopedMetadataReader<T> {
    private value: MetadataReadView<T> = EMPTY_METADATA_READ;
    private generation = 0;
    private cursor: number | null = null;
    private requested = false;
    private draining: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly ports: ScopedMetadataPorts<T>) {}
    get view(): MetadataReadView<T> { return this.value; }
    private allowed(): boolean { try { return this.ports.canRead() === true; } catch { return false; } }
    private update(value: MetadataReadView<T>): void { this.value = deepFreeze(value); try { this.ports.changed(); } catch { /* Rendering cannot alter metadata. */ } }
    invalidate(resetCursor = false): void {
        if (this.stopped) return;
        this.generation++; this.requested = false; if (resetCursor) this.cursor = null;
        this.update({ phase: 'stale', current: false, data: null });
    }
    anchor(revision: number): void { if (natural(revision) && (this.cursor === null || revision > this.cursor)) this.cursor = revision; }
    read(): Promise<void> {
        if (this.stopped) return Promise.resolve();
        if (!this.allowed()) { this.invalidate(); return Promise.resolve(); }
        this.requested = true; this.draining ??= Promise.resolve().then(() => this.drain()); return this.draining;
    }
    private async drain(): Promise<void> {
        try {
            while (!this.stopped && this.requested) {
                this.requested = false; const generation = this.generation;
                this.update({ phase: 'reading', current: false, data: null });
                if (this.stopped || generation !== this.generation) continue;
                if (!this.allowed()) { this.invalidate(); continue; }
                let result: unknown; try { result = await this.ports.request(); } catch { result = null; }
                if (this.stopped || generation !== this.generation) continue;
                if (!this.allowed()) { this.invalidate(); continue; }
                const data = this.ports.decode(result); const revision = data === null ? null : this.ports.revision(data);
                if (data === null || revision !== null && this.cursor !== null && revision < this.cursor) {
                    this.update({ phase: 'unavailable', current: false, data: null }); continue;
                }
                if (revision !== null) this.cursor = revision;
                this.update({ phase: 'ready', current: true, data });
            }
        } finally { this.draining = null; }
    }
    stop(): void { this.stopped = true; this.generation++; this.requested = false; this.value = EMPTY_METADATA_READ; }
}
