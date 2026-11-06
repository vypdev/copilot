import type { JournalKind } from '../domain/journal_facts.ts';

interface Job { readonly kind: JournalKind }
export interface JournalQueuePorts<T extends Job> {
    mayRun(kind: JournalKind): boolean; work(job: T): Promise<void>; failed(job: T): void; changed(): void;
}
/** One native operation at a time, one coalesced work slot per ticket, no spinning behind a clear lease. */
export class JournalWorkQueue<T extends Job> {
    private readonly pending = new Set<T>();
    private running: T | null = null;
    private draining: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly ports: JournalQueuePorts<T>) {}
    private mayRun(kind: JournalKind): boolean { try { return this.ports.mayRun(kind) === true; } catch { return false; } }
    private changed(): void { try { this.ports.changed(); } catch { /* Delivery cannot alter native outcomes. */ } }
    count(kind: JournalKind): number {
        return [...this.pending].filter(job => job.kind === kind).length
            + (this.running?.kind === kind && !this.pending.has(this.running) ? 1 : 0);
    }
    contains(job: T): boolean { return this.running === job || this.pending.has(job); }
    idle(kind: JournalKind): boolean {
        return !this.stopped && this.running?.kind !== kind && (!this.mayRun(kind) || ![...this.pending].some(job => job.kind === kind));
    }
    enqueue(job: T): boolean {
        if (this.stopped || (!this.contains(job) && this.pending.size + (this.running && !this.pending.has(this.running) ? 1 : 0) >= 200)) return false;
        this.pending.add(job); this.changed(); this.wake(); return true;
    }
    remove(job: T): void { this.pending.delete(job); this.changed(); }
    stop(): void { this.stopped = true; this.pending.clear(); this.changed(); }
    wake(): void {
        if (this.stopped || this.draining || !this.pending.size) return;
        // Establish single-flight before invoking even a synchronous reentrant port.
        this.draining = Promise.resolve().then(() => this.drain());
    }
    async flush(): Promise<void> { this.wake(); await this.draining; }
    private async drain(): Promise<void> {
        try {
            while (!this.stopped) {
                const next = [...this.pending].find(job => this.mayRun(job.kind));
                if (!next) break;
                this.pending.delete(next); this.running = next; this.changed();
                try { await this.ports.work(next); }
                catch { try { this.ports.failed(next); } catch { /* A secondary failure cannot stop remaining work. */ } }
                this.running = null; this.changed();
            }
        } finally { this.running = null; this.draining = null; this.changed(); }
    }
}
