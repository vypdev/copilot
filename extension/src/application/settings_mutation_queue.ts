export interface SettingsMutationReservation { current(): boolean; release(): void }

/** One owned FIFO for preference mutations; a history clear may reserve an idle queue. */
export class SettingsMutationQueue {
    private queue: Promise<void> = Promise.resolve();
    private pending = 0;
    private held: { readonly released: Promise<void> } | null = null;
    run<T>(work: () => Promise<T>): Promise<T> {
        this.pending++;
        const operation = this.queue.then(async () => {
            const held = this.held;
            if (held) await held.released;
            return work();
        });
        const settled = () => { this.pending--; };
        this.queue = operation.then(settled, settled);
        return operation;
    }
    reserve(): SettingsMutationReservation | null {
        if (this.pending || this.held) return null;
        let unlock!: () => void;
        const held = { released: new Promise<void>(resolve => { unlock = resolve; }) };
        this.held = held;
        return Object.freeze({ current: () => this.held === held, release: () => {
            if (this.held !== held) return;
            this.held = null; unlock();
        } });
    }
}
