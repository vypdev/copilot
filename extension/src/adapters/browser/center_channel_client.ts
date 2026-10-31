import { CENTER_CHANNEL, CENTER_CHANNEL_CAPACITY, CENTER_CHANNEL_DEADLINE, centerReplyFrame, centerRequestFrame, type ChannelMessage, type CenterReplyFrame } from '../../domain/center_channel.ts';
import type { BrowserApi, BrowserPort } from './api.ts';
import { CenterFrameDelivery } from './center_frame_delivery.ts';
import { centerFrameFingerprint, type CenterFrameFingerprint } from './center_frame_fingerprint.ts';

interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
/** A disconnected transport can reopen only for an explicit semantic center.open. */
export class CenterChannelClient {
    private port: BrowserPort | null = null;
    private sequence = 0;
    private stopped = false;
    private detach: (() => void) | null = null;
    private readonly pending = new Map<number, Pending>();
    private frames: CenterFrameDelivery<CenterReplyFrame> | null = null;
    constructor(private readonly runtime: BrowserApi['runtime'], private readonly lost: () => void,
        private readonly fingerprint: CenterFrameFingerprint = centerFrameFingerprint) {}
    private receive(frame: CenterReplyFrame): void {
        const pending = this.pending.get(frame.sequence);
        if (!pending) { this.retire(true); return; }
        this.pending.delete(frame.sequence); clearTimeout(pending.timer); pending.resolve(frame.result);
    }
    private retire(notify: boolean): void {
        const port = this.port; this.port = null;
        this.frames?.stop(); this.frames = null;
        this.detach?.(); this.detach = null;
        if (port) {
            try { port.disconnect(); } catch { /* Native shutdown cannot retain application authority. */ }
        }
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('center-channel-unavailable')); }
        this.pending.clear(); if (notify) this.lost();
    }
    send(message: ChannelMessage): Promise<unknown> {
        if (this.stopped || !centerRequestFrame({ sequence: 1, message })) return Promise.reject(new Error('center-channel-invalid'));
        if (!this.port) {
            if (message.method !== 'center.open') return Promise.reject(new Error('center-channel-unavailable'));
            try {
                const port = this.runtime.connect({ name: CENTER_CHANNEL }); this.port = port; this.sequence = 0;
                const frames = new CenterFrameDelivery(centerReplyFrame, frame => this.receive(frame), () => this.retire(true), this.fingerprint);
                this.frames = frames;
                const message = (value: unknown) => { if (this.port === port) frames.receive(value); };
                const lost = () => { void this.runtime.lastError; if (this.port === port) this.retire(true); };
                this.detach = () => { port.onMessage.removeListener(message); port.onDisconnect.removeListener(lost); };
                port.onMessage.addListener(message); port.onDisconnect.addListener(lost);
            } catch { this.retire(true); return Promise.reject(new Error('center-channel-unavailable')); }
        }
        if (this.pending.size >= CENTER_CHANNEL_CAPACITY || this.sequence === Number.MAX_SAFE_INTEGER) {
            this.retire(true); return Promise.reject(new Error('center-channel-capacity'));
        }
        const sequence = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.retire(true), CENTER_CHANNEL_DEADLINE);
            this.pending.set(sequence, { resolve, reject, timer });
            try { this.port!.postMessage({ sequence, message }); } catch { this.retire(true); }
        });
    }
    stop(): void { if (!this.stopped) { this.stopped = true; this.retire(false); } }
}
