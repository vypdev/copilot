import type { HistoryClientView } from '../domain/history_client_view.ts';
import { deepFreeze } from '../domain/value.ts';
import { HistoryReader } from './history_reader.ts';
import { HistoryReviewClient } from './history_review_client.ts';
import type { HistoryClientPorts } from './history_client_ports.ts';
import { HistoryExportClient } from './history_export_client.ts';
import type { JournalKind } from '../domain/journal_facts.ts';

/** Mounted-page ownership: independent read availability plus one private review flow, with a public immutable projection. */
export class HistoryClient {
    readonly reader: HistoryReader;
    readonly reviews: HistoryReviewClient;
    readonly exports: HistoryExportClient;
    private readonly listeners = new Set<(view: HistoryClientView) => void>();
    private signature = '';
    private stopped = false;
    constructor(ports: Omit<HistoryClientPorts, 'changed'> & { download?(kind: JournalKind, content: string): Promise<boolean> }) {
        const changed = () => this.publish();
        this.reader = new HistoryReader({ request: input => ports.request(input), changed });
        this.reviews = new HistoryReviewClient({ request: input => ports.request(input), now: () => ports.now(), canMutate: () => !this.exports.review && ports.canMutate(), changed }, (record, outcome) => {
            const kind = record.plan.kind;
            if (record.family === 'clear' && outcome?.state === 'observed-cleared') this.reader.anchor(kind, outcome.epoch, outcome.revision);
            else this.reader.invalidate(kind);
            if (!this.stopped && outcome && outcome.state !== 'pending' && outcome.state !== 'not-submitted') void this.reader.read(kind);
        });
        this.exports = new HistoryExportClient({ available: () => !this.reviews.view.review && !this.reviews.view.busy,
            snapshot: kind => { const slot = this.reader.view[kind]; return slot.current && slot.data?.retained.state === 'ready' ? slot.data.retained.snapshot : null; },
            download: (kind, content) => ports.download?.(kind, content) ?? Promise.resolve(false), changed });
    }
    get view(): HistoryClientView { return deepFreeze({ ...this.reviews.view, slots: this.reader.view, exportReview: this.exports.review, exportBusy: this.exports.busy, exportFailed: this.exports.failed }); }
    subscribe(listener: (view: HistoryClientView) => void): () => void {
        if (this.listeners.size >= 8) throw new Error('history-subscriber-capacity');
        this.listeners.add(listener); try { listener(this.view); } catch { /* Initial and later subscribers have the same isolation. */ }
        return () => { this.listeners.delete(listener); };
    }
    private publish(): void {
        if (this.stopped) return;
        this.exports?.synchronize();
        const view = this.view; const signature = JSON.stringify(view); if (signature === this.signature) return;
        this.signature = signature;
        for (const listener of this.listeners) { try { listener(view); } catch { /* A subscriber cannot erase established facts. */ } }
    }
    stop(): void { if (this.stopped) return; this.stopped = true; this.reviews.stop(); this.reader.stop(); this.exports.stop(); this.listeners.clear(); }
}
