import type { CancellationOwner, ReadCancellation } from './read_ports.ts';

/** A page may leave a shared GET; transport stops when its last consumer leaves. */
export class SharedReadCancellation implements CancellationOwner {
    private cancelled = false;
    private readonly consumers = new Set<() => void>();
    private readonly listeners = new Set<() => void>();
    get aborted(): boolean { return this.cancelled; }
    join(source: ReadCancellation): (() => void) | null {
        if (this.aborted || this.consumers.size >= 128) return null;
        let attached = true; let detach: () => void = () => undefined;
        const leave = () => {
            if (!attached) return;
            attached = false; detach(); this.consumers.delete(leave);
            if (this.consumers.size === 0) this.abort();
        };
        this.consumers.add(leave);
        detach = source.onAbort(leave);
        if (!attached) detach();
        return leave;
    }
    onAbort(callback: () => void): () => void {
        if (this.aborted) { callback(); return () => undefined; }
        this.listeners.add(callback); return () => { this.listeners.delete(callback); };
    }
    abort(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        for (const callback of this.listeners) callback();
        this.listeners.clear();
    }
    dispose(): void { for (const leave of [...this.consumers]) leave(); this.abort(); }
}
