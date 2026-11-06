import { EMPTY_HISTORY_VIEW, type HistoryReadSlot, type HistoryReadView } from '../domain/history_client_view.ts';
import type { JournalKind } from '../domain/journal_facts.ts';
import { decodeHistoryDocument } from '../domain/history_reply.ts';
import { deepFreeze } from '../domain/value.ts';
import type { HistoryClientPorts } from './history_client_ports.ts';

/** One read in flight and one coalesced trailing request per collection, including after reentrant notification. */
export class HistoryReader {
    private value: HistoryReadView = EMPTY_HISTORY_VIEW.slots;
    private readonly requested = new Set<JournalKind>();
    private readonly generations = { diagnostics: 0, recents: 0 };
    private readonly cursors: Record<JournalKind, { epoch: number; revision: number } | null> = { diagnostics: null, recents: null };
    private draining: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly ports: Pick<HistoryClientPorts, 'request' | 'changed'>) {}
    get view(): HistoryReadView { return this.value; }
    private update(kind: JournalKind, value: HistoryReadSlot): void {
        this.value = deepFreeze({ ...this.value, [kind]: value });
        try { this.ports.changed(); } catch { /* Renderer failure cannot alter observations. */ }
    }
    invalidate(kind?: JournalKind): void {
        if (this.stopped) return;
        for (const target of kind ? [kind] : ['diagnostics', 'recents'] as const) {
            this.generations[target]++; this.requested.delete(target);
            this.update(target, { phase: 'stale', current: false, data: null });
        }
    }
    anchor(kind: JournalKind, epoch: number, revision: number): void {
        const before = this.cursors[kind];
        if (before && (epoch < before.epoch || epoch === before.epoch && revision < before.revision)) return;
        this.cursors[kind] = { epoch, revision }; this.invalidate(kind);
    }
    read(kind: JournalKind): Promise<void> {
        if (this.stopped) return Promise.resolve();
        this.requested.add(kind);
        this.draining ??= Promise.resolve().then(() => this.drain()); return this.draining;
    }
    private async drain(): Promise<void> {
        try {
            while (!this.stopped && this.requested.size) {
                const kind = this.requested.values().next().value!; this.requested.delete(kind);
                const generation = this.generations[kind]; this.update(kind, { phase: 'reading', current: false, data: null });
                if (this.stopped || generation !== this.generations[kind]) continue;
                let result: unknown; try { result = await this.ports.request({ method: 'center.history.read', kind }); } catch { result = null; }
                if (this.stopped || generation !== this.generations[kind]) continue;
                const data = decodeHistoryDocument(result); const before = this.cursors[kind];
                if (!data || data.kind !== kind || data.writer.epoch !== null && before
                    && (data.writer.epoch < before.epoch || data.writer.epoch === before.epoch && data.writer.observedRevision! < before.revision)) {
                    this.update(kind, { phase: 'unavailable', current: false, data: null }); continue;
                }
                if (data.writer.epoch !== null) this.cursors[kind] = { epoch: data.writer.epoch, revision: data.writer.observedRevision! };
                this.update(kind, { phase: 'ready', current: true, data });
            }
        } finally { this.draining = null; }
    }
    stop(): void { this.stopped = true; this.requested.clear(); this.value = EMPTY_HISTORY_VIEW.slots; }
}
