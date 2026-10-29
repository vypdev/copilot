import { EMPTY_VISIT_DELIVERY, observedVisit, type VisitDeliveryView } from '../domain/center_visits.ts';
import type { HistoryMessage } from '../domain/history_protocol.ts';
import { collectionCurrent } from './collection_restrictions.ts';

export interface CapturedVisit { readonly message: Extract<HistoryMessage, { method: 'center.recents.observe' }>; readonly epoch: number }
export interface VisitDeliveryPorts {
    valid(value: CapturedVisit): boolean; relevant(value: CapturedVisit): boolean;
    request(message: CapturedVisit['message']): Promise<unknown>; changed(view: VisitDeliveryView): void;
}
/** One native submission plus one latest accepted visit. Unknown delivery is never retried. */
export class VisitDelivery {
    private active: CapturedVisit | null = null;
    private queued: CapturedVisit | null = null;
    private running: Promise<void> | null = null;
    private dropped = 0;
    private stopped = false;
    private signature = '';
    constructor(private readonly ports: VisitDeliveryPorts) {}
    get view(): VisitDeliveryView {
        return Object.freeze({ pending: Number(!!this.active && collectionCurrent(() => this.ports.relevant(this.active!)))
            + Number(!!this.queued && collectionCurrent(() => this.ports.relevant(this.queued!))), dropped: this.dropped, incomplete: this.dropped > 0 });
    }
    private publish(): void {
        if (this.stopped) return;
        const view = this.view; const signature = JSON.stringify(view); if (signature === this.signature) return;
        this.signature = signature; try { this.ports.changed(view); } catch { /* Delivery evidence cannot change application navigation. */ }
    }
    missing(): void { if (!this.stopped) { this.dropped = Math.min(Number.MAX_SAFE_INTEGER, this.dropped + 1); this.publish(); } }
    observe(value: CapturedVisit): void {
        if (this.stopped) return;
        const valid = collectionCurrent(() => this.ports.valid(value)); if (this.stopped) return;
        if (!valid) { if (collectionCurrent(() => this.ports.relevant(value))) this.missing(); return; }
        if (this.active) {
            const replaced = this.queued && collectionCurrent(() => this.ports.relevant(this.queued!));
            if (this.stopped) return;
            this.queued = value;
            if (replaced) this.dropped = Math.min(Number.MAX_SAFE_INTEGER, this.dropped + 1);
        } else {
            this.active = value; this.running = Promise.resolve().then(() => this.drain());
        }
        this.publish();
    }
    private async drain(): Promise<void> {
        try {
            while (this.active && !this.stopped) {
                const value = this.active; let response: unknown;
                if (collectionCurrent(() => this.ports.valid(value)) && !this.stopped) {
                    try { response = await this.ports.request(value.message); } catch { response = null; }
                }
                if (this.stopped) return;
                if (!observedVisit(response) && collectionCurrent(() => this.ports.relevant(value))) this.missing();
                this.active = this.queued; this.queued = null; this.publish();
            }
        } finally { this.running = null; }
    }
    flush(): Promise<void> { return this.running ?? Promise.resolve(); }
    reset(): void { if (!this.stopped) { this.queued = null; this.dropped = 0; this.publish(); } }
    stop(): void { this.stopped = true; this.active = null; this.queued = null; this.dropped = EMPTY_VISIT_DELIVERY.dropped; }
}
