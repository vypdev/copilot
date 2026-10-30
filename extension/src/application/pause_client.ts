import { deepFreeze } from '../domain/value.ts';
import type { PauseClientView } from '../domain/pause_client_view.ts';
import type { PauseClientPorts } from './pause_client_ports.ts';
import { PauseReader } from './pause_reader.ts';
import { PauseReviewClient } from './pause_review_client.ts';

/** One mounted native control page; reusable IDs stay in the review owner and never become renderer props. */
export class PauseClient {
    readonly reader: PauseReader;
    readonly reviews: PauseReviewClient;
    private stopped = false;
    private signature = '';
    private readonly listeners = new Set<(value: PauseClientView) => void>();
    constructor(ports: Omit<PauseClientPorts, 'changed'>) {
        const changed = () => this.publish();
        this.reader = new PauseReader({ request: input => ports.request(input), canRead: () => ports.canRead(), changed });
        this.reviews = new PauseReviewClient({ request: input => ports.request(input),
            canMutate: () => ports.canMutate(), now: () => ports.now(), changed }, outcome => {
            if (outcome?.state === 'committed' || outcome?.state === 'reconciled') this.reader.anchor(outcome.revision);
            this.reader.invalidate(); if (!this.stopped) void this.reader.read();
        });
    }
    get view(): PauseClientView { return deepFreeze({ reader: this.reader.view, ...this.reviews.view }); }
    private publish(): void {
        this.reviews.observeSnapshot(this.reader.view);
        const view = this.view; const signature = JSON.stringify(view); if (this.signature === signature) return; this.signature = signature;
        for (const listener of this.listeners) { try { listener(view); } catch { /* One renderer cannot erase observations. */ } }
    }
    subscribe(listener: (value: PauseClientView) => void): () => void {
        if (this.listeners.size >= 8) throw new Error('pause-subscriber-capacity'); this.listeners.add(listener);
        try { listener(this.view); } catch { /* Initial and later notifications have identical isolation. */ }
        return () => { this.listeners.delete(listener); };
    }
    contextChanged(): void { if (!this.stopped) { this.reviews.retire(); this.reader.invalidate(true); } }
    stop(): void { this.stopped = true; this.reader.stop(); this.reviews.stop(); this.listeners.clear(); }
}
