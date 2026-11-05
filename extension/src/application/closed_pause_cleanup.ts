import { planClosedTabPauses } from '../domain/closed_tab_pauses.ts';
import { natural } from '../domain/value.ts';
import type { TemporaryPauseStore } from './temporary_pause_store.ts';

/** One bounded owner of trusted native closure facts. Dropped/unknown cleanup never rebinds a closed ID or retries a write. */
export class ClosedPauseCleanup {
    private readonly closed = new Set<number>();
    private active: Promise<void> | null = null;
    private stopped = false;
    constructor(private readonly store: TemporaryPauseStore) {}
    close(tabId: number): void {
        if (this.stopped || !natural(tabId) || this.closed.size >= 128) return;
        this.closed.add(tabId); this.active ??= Promise.resolve().then(() => this.drain());
    }
    idle(): Promise<void> { return this.active ?? Promise.resolve(); }
    private async drain(): Promise<void> {
        try {
            while (!this.stopped && this.closed.size) {
                const ids = [...this.closed];
                const witness = this.store.guard.capture();
                const inspected = await this.store.inspect().catch(() => null);
                if (this.stopped) return;
                const pending = this.store.pendingMutations();
                if (pending) { await pending; continue; }
                // A completed write may have invalidated the snapshot while the read was in flight.
                if (witness !== this.store.guard.capture()) continue;
                for (const id of ids) this.closed.delete(id);
                if (inspected?.loaded.state !== 'ready' || inspected.pending) continue;
                const plan = planClosedTabPauses(inspected.loaded.value, ids);
                if (plan.state === 'ready') await this.store.commit(plan.before, plan.after, () => !this.stopped);
            }
        } catch { /* Lifecycle cleanup preserves the native record; a later explicit view can inspect any unavailable scopes. */ }
        finally { this.active = null; }
    }
    stop(): void { this.stopped = true; this.closed.clear(); }
}
