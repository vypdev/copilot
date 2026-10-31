import { expect, it, vi } from 'vitest';
import { CenterChannelClient } from '../../src/adapters/browser/center_channel_client.ts';
import { CenterChannelHost } from '../../src/adapters/browser/center_channel_host.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { nativePortPair } from '../fixtures/native_port.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';
import { fixtureFrameFingerprint } from '../fixtures/frame_fingerprint.ts';

const tick = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
it.each([
    ['requests', { request: 2, reply: 1 }],
    ['replies', { request: 1, reply: 2 }],
    ['both directions', { request: 2, reply: 2 }],
] as const)('distinct native copies of identical %s preserve one dispatch and the next request', async (_name, copies) => {
    const h = browserFixture(); const pair = nativePortPair('copilot.center.v1', CENTER_SENDER, copies);
    const handle = vi.fn(async () => ({ state: 'ready' })); const release = vi.fn(); const lost = vi.fn();
    const host = new CenterChannelHost(h.api.runtime, { handle, release });
    vi.mocked(h.api.runtime.connect).mockImplementation(() => {
        queueMicrotask(() => { for (const listener of h.onConnect.listeners) listener(pair.server); }); return pair.client;
    });
    const client = new CenterChannelClient(h.api.runtime, lost);
    try {
        await expect(client.send({ version: 1, method: 'center.open' })).resolves.toEqual({ state: 'ready' }); await tick();
        expect(handle).toHaveBeenCalledOnce(); expect(pair.client.postMessage).toHaveBeenCalledOnce();
        expect(pair.server.postMessage).toHaveBeenCalledOnce(); expect(lost).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
        expect(pair.live()).toBe(true);
        await expect(client.send({ version: 1, method: 'center.open' })).resolves.toEqual({ state: 'ready' }); await tick();
        expect(handle).toHaveBeenCalledTimes(2); expect(pair.live()).toBe(true); expect(lost).not.toHaveBeenCalled();
    } finally { client.stop(); host.stop(); }
});

function windowFixture() {
    const h = browserFixture(); const pair = nativePortPair('copilot.center.v1', CENTER_SENDER);
    const handle = vi.fn(async () => ({ state: 'ready' })); const release = vi.fn(); const lost = vi.fn();
    const host = new CenterChannelHost(h.api.runtime, { handle, release });
    vi.mocked(h.api.runtime.connect).mockImplementation(() => {
        queueMicrotask(() => { for (const listener of h.onConnect.listeners) listener(pair.server); }); return pair.client;
    });
    const client = new CenterChannelClient(h.api.runtime, lost);
    return { pair, handle, release, lost, client, host };
}
it('a request older than the retained delivery window still retires the source without running again', async () => {
    const h = windowFixture(); const closed = deferred<void>();
    try {
        for (let count = 0; count < 17; count++) await h.client.send({ version: 1, method: 'center.open' });
        h.lost.mockImplementation(() => closed.resolve());
        h.pair.client.postMessage({ sequence: 1, message: { version: 1, method: 'center.open' } }); await closed.promise;
        expect(h.handle).toHaveBeenCalledTimes(17); expect(h.release).toHaveBeenCalledOnce(); expect(h.pair.live()).toBe(false);
    } finally { h.client.stop(); h.host.stop(); }
});
it('an old reply outside the retained window cannot establish completion or keep a source current', async () => {
    const h = windowFixture(); const closed = deferred<void>();
    try {
        for (let count = 0; count < 17; count++) await h.client.send({ version: 1, method: 'center.open' });
        h.lost.mockImplementation(() => closed.resolve());
        h.pair.server.postMessage({ sequence: 1, result: { state: 'ready' } }); await closed.promise;
        expect(h.handle).toHaveBeenCalledTimes(17); expect(h.lost).toHaveBeenCalledOnce(); expect(h.pair.live()).toBe(false);
    } finally { h.client.stop(); h.host.stop(); }
});
it('out-of-order replies and their native copies resolve only their own pending requests', async () => {
    const h = browserFixture(); const pair = nativePortPair('copilot.center.v1', CENTER_SENDER, { request: 1, reply: 2 });
    vi.mocked(h.api.runtime.connect).mockReturnValue(pair.client); const lost = vi.fn(); const client = new CenterChannelClient(h.api.runtime, lost);
    try {
        const first = client.send({ version: 1, method: 'center.open' }); const second = client.send({ version: 1, method: 'center.open' });
        pair.server.postMessage({ sequence: 2, result: { state: 'second' } }); pair.server.postMessage({ sequence: 1, result: { state: 'first' } });
        expect(await Promise.all([first, second])).toEqual([{ state: 'first' }, { state: 'second' }]);
        await tick(); expect(lost).not.toHaveBeenCalled(); expect(pair.live()).toBe(true);
    } finally { client.stop(); }
});
it('a failed old-source hash cannot retire a successfully reconnected client', async () => {
    const h = browserFixture(); const pairs: ReturnType<typeof nativePortPair>[] = [];
    vi.mocked(h.api.runtime.connect).mockImplementation(({ name }) => {
        const pair = nativePortPair(name, CENTER_SENDER); pairs.push(pair); return pair.client;
    });
    const entered = deferred<void>(); const hash = deferred<string | null>();
    const fingerprint = vi.fn(fixtureFrameFingerprint).mockImplementationOnce(() => { entered.resolve(); return hash.promise; });
    const lost = vi.fn(); const client = new CenterChannelClient(h.api.runtime, lost, fingerprint);
    try {
        const first = client.send({ version: 1, method: 'center.open' }); const unavailable = expect(first).rejects.toThrow('unavailable');
        pairs[0].server.postMessage({ sequence: 1, result: { state: 'old' } }); await entered.promise;
        pairs[0].server.disconnect(); await unavailable;
        const next = client.send({ version: 1, method: 'center.open' }); pairs[1].server.postMessage({ sequence: 1, result: { state: 'replacement' } });
        expect(await next).toEqual({ state: 'replacement' }); hash.reject(new Error('late old-source digest failure')); await tick();
        expect(lost).toHaveBeenCalledOnce(); expect(pairs[1].live()).toBe(true);
        const current = client.send({ version: 1, method: 'center.open' }); pairs[1].server.postMessage({ sequence: 2, result: { state: 'current' } });
        expect(await current).toEqual({ state: 'current' });
    } finally { client.stop(); }
});
