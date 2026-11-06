import { MAX_CENTER_REQUEST_BYTES } from './settings_change.ts';
import { MAX_CENTER_RESPONSE_BYTES, parseCenterMessage } from './center_protocol.ts';
import { jsonBytesWithin, keys, natural, record } from './value.ts';

export const CENTER_CHANNEL = 'copilot.center.v1';
export const CENTER_CHANNEL_CAPACITY = 16;
export const CENTER_CHANNEL_DEADLINE = 30_000;
export type ChannelMessage = NonNullable<ReturnType<typeof parseCenterMessage>>;
export interface CenterRequestFrame { readonly sequence: number; readonly message: ChannelMessage }
export interface CenterReplyFrame { readonly sequence: number; readonly result: unknown }
function frame(value: unknown, payload: string, bound: number): value is Record<string, unknown> & { sequence: number } {
    return record(value) && keys(value, ['sequence', payload]) && Object.keys(value).length === 2
        && natural(value.sequence) && value.sequence > 0 && jsonBytesWithin(value, bound + 1024);
}
export function centerRequestFrame(value: unknown): CenterRequestFrame | null {
    if (!frame(value, 'message', MAX_CENTER_REQUEST_BYTES)) return null;
    const message = parseCenterMessage(value.message);
    return message ? { sequence: value.sequence, message } : null;
}
export function centerReplyFrame(value: unknown): CenterReplyFrame | null {
    return frame(value, 'result', MAX_CENTER_RESPONSE_BYTES) && record(value.result) && jsonBytesWithin(value.result, MAX_CENTER_RESPONSE_BYTES)
        ? { sequence: value.sequence, result: value.result } : null;
}
