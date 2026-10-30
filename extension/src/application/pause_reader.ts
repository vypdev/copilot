import { EMPTY_PAUSE_READ, type PauseReadView } from '../domain/pause_client_view.ts';
import { decodePauseControl } from '../domain/pause_reply.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { PauseClientPorts } from './pause_client_ports.ts';

/** One metadata request and one coalesced trailing read; metadata never confirms or repeats an effect. */
export class PauseReader {
    private value = EMPTY_PAUSE_READ;
    private generation = 0;
    private cursor: number | null = null;
    private requested = false;
    private draining: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly ports: Pick<PauseClientPorts, 'request' | 'canRead' | 'changed'>) {}
    get view(): PauseReadView { return this.value; }
    private allowed(): boolean { try { return this.ports.canRead() === true; } catch { return false; } }
    private update(value: PauseReadView): void { this.value = deepFreeze(value); try { this.ports.changed(); } catch { /* Rendering cannot alter metadata. */ } }
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
                let result: unknown; try { result = await this.ports.request({ method: 'center.pauses.read' }); } catch { result = null; }
                if (this.stopped || generation !== this.generation) continue;
                if (!this.allowed()) { this.invalidate(); continue; }
                const data = decodePauseControl(result);
                if (!data || data.loaded.state === 'ready' && this.cursor !== null && data.loaded.value.revision < this.cursor) {
                    this.update({ phase: 'unavailable', current: false, data: null }); continue;
                }
                if (data.loaded.state === 'ready') this.cursor = data.loaded.value.revision;
                this.update({ phase: 'ready', current: true, data });
            }
        } finally { this.draining = null; }
    }
    stop(): void { this.stopped = true; this.generation++; this.requested = false; this.value = EMPTY_PAUSE_READ; }
}
