import type { BrowserApi } from '../../src/adapters/browser/api.ts';
import { centerRequestFrame } from '../../src/domain/center_channel.ts';
import { nativePortPair } from './native_port.ts';
import { CENTER_SENDER } from './center.ts';
import { vi } from 'vitest';
import { record } from '../../src/domain/value.ts';

/** Presentation-only semantic dispatch. Native asynchronous delivery/disposal belongs to native_center_dom, not this fixture. */
export function semanticCenterChannel(api: BrowserApi, send: (message: unknown) => Promise<unknown>, sourceTree: string): void {
    api.runtime.connect = vi.fn(options => {
        const pair = nativePortPair(options.name, CENTER_SENDER);
        pair.client.postMessage = vi.fn(value => {
            const frame = centerRequestFrame(value);
            if (!frame) { pair.server.disconnect(); return; }
            // A semantic missing response is an incomplete method result, not physical channel corruption.
            const reply = (result: unknown) => { if (pair.live()) pair.server.postMessage({ sequence: frame.sequence, result: record(result) ? result : { sourceTree } }); };
            try { void send(frame.message).then(reply, () => reply(null)); } catch { reply(null); }
        });
        return pair.client;
    });
}
