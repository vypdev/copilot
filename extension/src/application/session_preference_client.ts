import { deepFreeze } from '../domain/value.ts';
import type { SessionPreferenceClientView } from '../domain/session_preference_client_view.ts';
import type { SessionPreferenceClientPorts } from './session_preference_client_ports.ts';
import { SessionPreferenceClientReader } from './session_preference_client_reader.ts';
import { SessionPreferenceReviewClient } from './session_preference_review_client.ts';

/** One native control page; snapshots and outcomes remain separate, opaque operation selectors stay private. */
export class SessionPreferenceClient {
    readonly reader: SessionPreferenceClientReader;
    readonly reviews: SessionPreferenceReviewClient;
    private stopped = false;
    private signature = '';
    private readonly listeners = new Set<(value: SessionPreferenceClientView) => void>();
    constructor(ports: Omit<SessionPreferenceClientPorts, 'changed'>) {
        const changed = () => this.publish();
        this.reader = new SessionPreferenceClientReader({ request: input => ports.request(input), canRead: () => ports.canRead(), changed });
        this.reviews = new SessionPreferenceReviewClient({ request: input => ports.request(input), canMutate: () => ports.canMutate(), now: () => ports.now(), changed },
            () => this.reader.view, outcome => {
                if (outcome?.state === 'result' && (outcome.outcome.state === 'committed' || outcome.outcome.state === 'reconciled')) this.reader.anchor(outcome.outcome.revision);
                this.reader.invalidate(); if (!this.stopped) void this.reader.read();
            });
    }
    get view(): SessionPreferenceClientView { return deepFreeze({ reader: this.reader.view, ...this.reviews.view }); }
    private publish(): void {
        this.reviews.observeSnapshot(this.reader.view);
        const view = this.view; const signature = JSON.stringify(view); if (this.signature === signature) return; this.signature = signature;
        for (const listener of this.listeners) { try { listener(view); } catch { /* One renderer cannot erase observations. */ } }
    }
    subscribe(listener: (value: SessionPreferenceClientView) => void): () => void {
        if (this.listeners.size >= 8) throw new Error('session-preference-subscriber-capacity'); this.listeners.add(listener);
        try { listener(this.view); } catch { /* Initial and later delivery use identical isolation. */ }
        return () => { this.listeners.delete(listener); };
    }
    contextChanged(): void { if (!this.stopped) { this.reviews.retire(); this.reader.invalidate(true); } }
    stop(): void { this.stopped = true; this.reader.stop(); this.reviews.stop(); this.listeners.clear(); }
}
