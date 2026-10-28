import type { CancellationOwner } from '../../application/read_ports.ts';

export class BrowserCancellation implements CancellationOwner {
    private readonly controller = new AbortController();
    get aborted(): boolean { return this.controller.signal.aborted; }
    onAbort(callback: () => void): () => void {
        if (this.aborted) { callback(); return () => undefined; }
        this.controller.signal.addEventListener('abort', callback, { once: true });
        return () => this.controller.signal.removeEventListener('abort', callback);
    }
    abort(): void { this.controller.abort(); }
}
