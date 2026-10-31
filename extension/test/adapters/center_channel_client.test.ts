import { afterEach, expect, it, vi } from 'vitest';
import { CenterChannelClient } from '../../src/adapters/browser/center_channel_client.ts';
import { CENTER_CHANNEL_DEADLINE, type ChannelMessage } from '../../src/domain/center_channel.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { nativePortPair } from '../fixtures/native_port.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { fixtureFrameFingerprint } from '../fixtures/frame_fingerprint.ts';

afterEach(() => vi.useRealTimers());
const open = { version: 1, method: 'center.open' } as const;
function fixture() {
    const h = browserFixture(); const pairs: ReturnType<typeof nativePortPair>[] = [];
    vi.mocked(h.api.runtime.connect).mockImplementation(({ name }) => {
        const pair = nativePortPair(name, CENTER_SENDER); pairs.push(pair); return pair.client;
    });
    const lost = vi.fn(); const client = new CenterChannelClient(h.api.runtime, lost, fixtureFrameFingerprint);
    const respond = (sequence: number, result: unknown = { state: 'ready' }) => pairs.at(-1)!.server.postMessage({ sequence, result });
    return { ...h, client, pairs, lost, respond };
}
it('native client opens the fixed channel and delivers a matching reply exactly once', async () => {
    const h = fixture(); const promise = h.client.send(open); h.respond(1); await expect(promise).resolves.toEqual({ state: 'ready' });
    expect(h.api.runtime.connect).toHaveBeenCalledExactlyOnceWith({ name: 'copilot.center.v1' }); h.client.stop();
});
it('native client supports out-of-order replies for distinct bounded requests', async () => {
    const h = fixture(); const first = h.client.send(open); const second = h.client.send(open);
    h.respond(2, { n: 2 }); h.respond(1, { n: 1 }); expect(await first).toEqual({ n: 1 }); expect(await second).toEqual({ n: 2 }); h.client.stop();
});
it('native client never connects for a stale read without an explicit fresh open', async () => {
    const h = fixture(); await expect(h.client.send({ version: 1, method: 'center.read', clientId: 'a'.repeat(32) })).rejects.toThrow('unavailable');
    expect(h.api.runtime.connect).not.toHaveBeenCalled(); h.client.stop();
});
it('native client refuses malformed application requests without creating a native channel', async () => {
    const h = fixture(); await expect(h.client.send({ version: 2, method: 'center.open' } as unknown as ChannelMessage)).rejects.toThrow('invalid');
    expect(h.api.runtime.connect).not.toHaveBeenCalled(); h.client.stop();
});
it('native client contains native connect exceptions and exposes no provider details', async () => {
    const h = fixture(); vi.mocked(h.api.runtime.connect).mockImplementation(() => { throw new Error('private-native-error'); });
    await expect(h.client.send(open)).rejects.toThrow('center-channel-unavailable'); expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client retires on a post failure and rejects every outstanding request', async () => {
    const h = fixture(); const first = h.client.send(open); const rejection = expect(first).rejects.toThrow('unavailable');
    vi.mocked(h.pairs[0].client.postMessage).mockImplementation(() => { throw new Error('private-post-error'); });
    await expect(h.client.send(open)).rejects.toThrow('unavailable'); await rejection; expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client disconnect removes authority while idle, without waiting for another request', async () => {
    const h = fixture(); const openReply = h.client.send(open); h.respond(1); await openReply;
    h.pairs[0].server.disconnect(); await Promise.resolve(); expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client disconnect rejects pending operations without replaying their bodies', async () => {
    const h = fixture(); const promise = h.client.send(open); const rejection = expect(promise).rejects.toThrow('unavailable');
    h.pairs[0].server.disconnect(); await rejection;
    expect(h.pairs[0].client.postMessage).toHaveBeenCalledOnce(); expect(h.api.runtime.connect).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client explicit reopen starts a new correlation space with new native identity', async () => {
    const h = fixture(); const first = h.client.send(open); h.respond(1); await first;
    h.pairs[0].server.disconnect(); await Promise.resolve(); const next = h.client.send(open); h.respond(1); await next;
    expect(h.pairs).toHaveLength(2); expect(h.pairs[1].client).not.toBe(h.pairs[0].client); h.client.stop();
});
it('native client ignores a previously queued old-source reply and disconnect after replacement', async () => {
    const h = fixture(); const first = h.client.send(open); h.respond(1); await first;
    const lateMessage = [...h.pairs[0].clientMessages.listeners][0]; const lateLost = [...h.pairs[0].clientLost.listeners][0];
    h.pairs[0].server.disconnect(); await Promise.resolve(); const next = h.client.send(open);
    lateMessage({ sequence: 1, result: { foreign: true } }); lateLost(); h.respond(1, { current: true });
    expect(await next).toEqual({ current: true }); expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it.each([['malformed', { sequence: 1, result: null }], ['unsolicited', { sequence: 20, result: {} }]])('native client rejects %s response and retires pending work', async (_name, response) => {
    const h = fixture(); const promise = h.client.send(open); const rejection = expect(promise).rejects.toThrow('unavailable');
    h.pairs[0].server.postMessage(response); await rejection; expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client rejects a duplicated reply rather than accepting it for another request', async () => {
    const h = fixture(); const first = h.client.send(open); h.respond(1); await first;
    const second = h.client.send(open); const rejection = expect(second).rejects.toThrow('unavailable'); h.respond(1, { state: 'changed' }); await rejection;
    expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client expires a hung request at its bounded deadline with no background replay', async () => {
    vi.useFakeTimers(); const h = fixture(); const promise = h.client.send(open); const rejection = expect(promise).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(CENTER_CHANNEL_DEADLINE - 1); expect(h.lost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejection; expect(h.lost).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); h.client.stop();
});
it('native client capacity exhaustion retires all requests without sending the seventeenth', async () => {
    const h = fixture(); const requests = Array.from({ length: 16 }, () => h.client.send(open));
    const results = Promise.allSettled(requests); await expect(h.client.send(open)).rejects.toThrow('capacity');
    expect((await results).every(result => result.status === 'rejected')).toBe(true); expect(h.pairs[0].client.postMessage).toHaveBeenCalledTimes(16); h.client.stop();
});
it('native client stop is idempotent, removes native listeners and cannot reopen', async () => {
    vi.useFakeTimers(); const h = fixture(); const first = h.client.send(open); const rejection = expect(first).rejects.toThrow('unavailable');
    h.client.stop(); h.client.stop(); await rejection; await expect(h.client.send(open)).rejects.toThrow('invalid');
    expect(h.pairs[0].clientMessages.listeners.size).toBe(0); expect(h.pairs[0].clientLost.listeners.size).toBe(0);
    expect(h.lost).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('native client admits the last safe counter then retires without wrapping or reusing a correlation', async () => {
    const h = fixture(); const first = h.client.send(open); h.respond(1); await first;
    // Boundary fault injection avoids quadrillions of requests; native identity and all admission remain real fixture paths.
    Reflect.set(h.client, 'sequence', Number.MAX_SAFE_INTEGER - 1);
    const last = h.client.send(open); h.respond(Number.MAX_SAFE_INTEGER); await last;
    await expect(h.client.send(open)).rejects.toThrow('capacity'); expect(h.lost).toHaveBeenCalledOnce(); h.client.stop();
});
it('native client cleanup contains a native disconnect exception after all callbacks and timers are retired', async () => {
    const h = fixture(); const first = h.client.send(open); h.respond(1); await first;
    vi.mocked(h.pairs[0].client.disconnect).mockImplementation(() => { throw new Error('private-native-cleanup'); });
    expect(() => h.client.stop()).not.toThrow(); expect(h.pairs[0].clientLost.listeners.size).toBe(0); h.pairs[0].server.disconnect();
});
