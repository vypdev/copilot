import { expect, it } from 'vitest';
import { centerRequestFrame, centerReplyFrame } from '../../src/domain/center_channel.ts';
import { MAX_CENTER_RESPONSE_BYTES } from '../../src/domain/center_protocol.ts';
import { MAX_CENTER_REQUEST_BYTES } from '../../src/domain/settings_change.ts';

const open = { version: 1, method: 'center.open' };
it('native channel rejects missing, scalar and array frames rather than treating them as structured requests or replies', () => {
    for (const frame of [null, undefined, [], 3, 'foreign']) { expect(centerRequestFrame(frame)).toBeNull(); expect(centerReplyFrame(frame)).toBeNull(); }
});
it('native channel accepts a bounded closed center request with a positive sequence', () => {
    expect(centerRequestFrame({ sequence: 1, message: open })).toEqual({ sequence: 1, message: open });
});
it.each([
    ['non-record', []], ['zero', 0], ['negative', -1], ['fractional', 1.5], ['unsafe', Number.MAX_SAFE_INTEGER + 1],
    ['non-finite', Infinity], ['text', '1'],
])('native channel rejects %s request sequence', (_name, sequence) => {
    expect(centerRequestFrame({ sequence, message: open })).toBeNull();
});
it('native channel accepts the last safe sequence without rounding it', () => {
    expect(centerRequestFrame({ sequence: Number.MAX_SAFE_INTEGER, message: open })?.sequence).toBe(Number.MAX_SAFE_INTEGER);
});
it('native channel rejects a caller-supplied source even around an otherwise valid message', () => {
    expect(centerRequestFrame({ sequence: 1, message: open, source: 'foreign-document' })).toBeNull();
});
it('native channel rejects omitted request payload instead of promoting defaults', () => {
    expect(centerRequestFrame({ sequence: 1 })).toBeNull();
});
it('native channel rejects non-center legacy session commands', () => {
    expect(centerRequestFrame({ sequence: 1, message: { version: 1, method: 'session.disconnect' } })).toBeNull();
});
it('native channel retains closed center method field validation', () => {
    expect(centerRequestFrame({ sequence: 1, message: { ...open, clientId: '0'.repeat(32) } })).toBeNull();
});
it('native channel rejects an excessive request before dispatch', () => {
    expect(centerRequestFrame({ sequence: 1, message: { ...open, padding: 'x'.repeat(MAX_CENTER_REQUEST_BYTES + 1024) } })).toBeNull();
});
it('native channel rejects cyclic wire values without throwing or dispatching', () => {
    const message = { ...open, self: null as unknown }; message.self = message;
    expect(centerRequestFrame({ sequence: 1, message })).toBeNull();
});
it('native channel replies preserve unknown semantic records for the owning response decoder', () => {
    expect(centerReplyFrame({ sequence: 3, result: { state: 'unavailable', sourceTree: 'unbundled' } })).toMatchObject({ sequence: 3 });
});
it.each([null, [], 'private-error'])('native channel rejects non-record response %j', result => {
    expect(centerReplyFrame({ sequence: 1, result })).toBeNull();
});
it('native channel enforces payload response bounds independently of envelope overhead', () => {
    expect(centerReplyFrame({ sequence: 1, result: { value: 'x'.repeat(MAX_CENTER_RESPONSE_BYTES - 12) } })).not.toBeNull();
    expect(centerReplyFrame({ sequence: 1, result: { value: 'x'.repeat(MAX_CENTER_RESPONSE_BYTES) } })).toBeNull();
});
it('native channel rejects response extras and zero correlation without exposing them as payload', () => {
    expect(centerReplyFrame({ sequence: 1, result: {}, injected: true })).toBeNull();
    expect(centerReplyFrame({ sequence: 0, result: {} })).toBeNull();
});
