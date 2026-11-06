import type { JournalKind } from '../domain/journal_facts.ts';
import type { JournalSnapshot } from '../domain/local_journal.ts';
import { previewHistoryExport, type HistoryExportReview } from '../domain/history_export.ts';

export interface HistoryExportPorts {
    snapshot(kind: JournalKind): JournalSnapshot | null;
    available(): boolean;
    download(kind: JournalKind, content: string): Promise<boolean>;
    changed(): void;
}
/** Download is an explicit second gesture against the exact current reviewed bytes. */
export class HistoryExportClient {
    private value: HistoryExportReview | null = null;
    private stopped = false;
    private downloading = false;
    private failure = false;
    constructor(private readonly ports: HistoryExportPorts) {}
    get review(): HistoryExportReview | null { return this.value; }
    get busy(): boolean { return this.downloading; }
    get failed(): boolean { return this.failure; }
    private changed(): void { try { this.ports.changed(); } catch { /* Delivery cannot alter review/download facts. */ } }
    preview(kind: JournalKind): boolean {
        if (this.stopped || this.downloading) return false;
        try {
            if (!this.ports.available()) return false;
            const snapshot = this.ports.snapshot(kind); if (!snapshot) return false;
            this.failure = false; this.value = previewHistoryExport(kind, snapshot); this.changed(); return this.value !== null;
        } catch { return false; }
    }
    invalidate(): void { if (this.value) { this.value = null; this.failure = false; this.changed(); } }
    /** Called before publication; stale retained bytes disappear with their read observation. */
    synchronize(): void {
        if (!this.value) return;
        try {
            const snapshot = this.ports.snapshot(this.value.kind);
            if (!snapshot || previewHistoryExport(this.value.kind, snapshot)?.content !== this.value.content) { this.value = null; this.failure = false; }
        } catch { this.value = null; this.failure = false; }
    }
    async download(): Promise<boolean> {
        const review = this.value; if (this.stopped || this.downloading || !review) return false;
        try {
            const snapshot = this.ports.snapshot(review.kind);
            const current = snapshot && previewHistoryExport(review.kind, snapshot);
            if (!this.ports.available() || current?.content !== review.content) { this.invalidate(); return false; }
            this.failure = false; this.downloading = true; this.changed();
            if (this.stopped || this.value !== review) return false;
            const accepted = await this.ports.download(review.kind, review.content);
            if (accepted && this.value === review) this.invalidate(); else if (!accepted && this.value === review) this.failure = true; return accepted;
        } catch { if (!this.stopped && this.value === review) this.failure = true; return false; }
        finally { this.downloading = false; this.changed(); }
    }
    stop(): void { this.stopped = true; this.value = null; this.failure = false; }
}
