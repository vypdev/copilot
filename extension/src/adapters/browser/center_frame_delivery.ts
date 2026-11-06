import { CENTER_CHANNEL_CAPACITY } from '../../domain/center_channel.ts';
import { CenterDeliveryWindow } from '../../domain/center_delivery.ts';
import { centerFrameFingerprint, type CenterFrameFingerprint } from './center_frame_fingerprint.ts';

export const CENTER_DELIVERY_CAPACITY = CENTER_CHANNEL_CAPACITY * 2;
/** Ordered native arrivals; exact copies never repeat semantic dispatch or replies. */
export class CenterFrameDelivery<T extends { readonly sequence: number }> {
    private readonly window = new CenterDeliveryWindow();
    private readonly queue: T[] = [];
    private running = false;
    private stopped = false;
    constructor(private readonly parse: (value: unknown) => T | null,
        private readonly deliver: (frame: T) => void, private readonly failure: () => void,
        private readonly fingerprint: CenterFrameFingerprint = centerFrameFingerprint) {}
    receive(value: unknown): void {
        if (this.stopped) return;
        let frame: T | null;
        try { frame = this.parse(value); } catch { this.reject(); return; }
        if (!frame || this.queue.length + Number(this.running) >= CENTER_DELIVERY_CAPACITY) { this.reject(); return; }
        this.queue.push(frame); void this.drain();
    }
    private reject(): void {
        if (this.stopped) return;
        this.stop();
        try { this.failure(); } catch { /* Retirement cannot depend on an observer. */ }
    }
    private async drain(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            while (!this.stopped && this.queue.length) {
                const frame = this.queue.shift()!;
                let fingerprint: string | null;
                try { fingerprint = await this.fingerprint(frame); }
                catch { this.reject(); return; }
                if (this.stopped) return;
                const decision = this.window.observe(frame.sequence, fingerprint);
                if (decision === 'duplicate') continue;
                if (decision !== 'new') { this.reject(); return; }
                try { this.deliver(frame); } catch { this.reject(); return; }
            }
        } finally { this.running = false; }
    }
    stop(): void { this.stopped = true; this.queue.length = 0; this.window.clear(); }
}
