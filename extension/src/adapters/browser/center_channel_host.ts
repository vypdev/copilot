import { CENTER_CHANNEL, CENTER_CHANNEL_CAPACITY, centerRequestFrame, type CenterRequestFrame } from '../../domain/center_channel.ts';
import { centerReplyFrame } from '../../domain/center_channel.ts';
import { extensionSender, type Sender } from '../../domain/protocol.ts';
import { centerBinding } from '../../application/center_controller.ts';
import type { BrowserApi, BrowserPort } from './api.ts';
import { CenterFrameDelivery } from './center_frame_delivery.ts';
import { centerFrameFingerprint, type CenterFrameFingerprint } from './center_frame_fingerprint.ts';

interface Handler {
    handle(value: unknown, sender: Sender, source: Readonly<object>): Promise<unknown>;
    release(source: Readonly<object>): void;
}
/** Only the native receiver creates source identity; no serialized value can select it. */
export class CenterChannelHost {
    private readonly connections = new Map<BrowserPort, { readonly tabId: number | null; close(): void }>();
    private stopped = false;
    constructor(private readonly runtime: BrowserApi['runtime'], private readonly handler: Handler,
        private readonly fingerprint: CenterFrameFingerprint = centerFrameFingerprint) {
        runtime.onConnect.addListener(this.connect);
    }
    private disconnect(port: BrowserPort): void { try { port.disconnect(); } catch { /* Authority was retired before native cleanup. */ } }
    private readonly connect = (port: BrowserPort): void => {
        const sender = port.sender; const binding = sender && centerBinding(sender);
        if (this.stopped || port.name !== CENTER_CHANNEL || !sender || !binding || this.connections.size >= 8
            || !extensionSender(sender, this.runtime.id, this.runtime.getURL(''))) { this.disconnect(port); return; }
        const source = Object.freeze({}); let live = true; let sequence = 0; let pending = 0;
        const close = () => {
            if (!live) return;
            live = false; frames.stop(); this.connections.delete(port); this.handler.release(source);
            port.onMessage.removeListener(message); port.onDisconnect.removeListener(lost); this.disconnect(port);
        };
        const lost = () => { void this.runtime.lastError; close(); };
        const dispatch = (frame: CenterRequestFrame) => {
            if (frame.sequence <= sequence || pending >= CENTER_CHANNEL_CAPACITY) { close(); return; }
            sequence = frame.sequence; pending++;
            void this.handler.handle(frame.message, sender, source).then(result => {
                if (!live) return;
                const reply = centerReplyFrame({ sequence: frame.sequence, result });
                if (!reply) { close(); return; }
                try { port.postMessage(reply); } catch { close(); }
            }).catch(() => { close(); }).finally(() => { pending--; });
        };
        const frames = new CenterFrameDelivery(centerRequestFrame, dispatch, close, this.fingerprint);
        const message = (value: unknown) => { if (live) frames.receive(value); };
        this.connections.set(port, { tabId: binding.tabId, close });
        port.onDisconnect.addListener(lost); port.onMessage.addListener(message);
    };
    releaseTab(tabId: number): void {
        for (const entry of this.connections.values()) if (entry.tabId === tabId) entry.close();
    }
    stop(): void {
        if (this.stopped) return;
        this.stopped = true; this.runtime.onConnect.removeListener(this.connect);
        for (const entry of this.connections.values()) entry.close();
    }
}
