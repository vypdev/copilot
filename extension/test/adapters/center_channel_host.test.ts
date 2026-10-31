import { expect, it, vi } from 'vitest';
import { CenterChannelHost } from '../../src/adapters/browser/center_channel_host.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { nativePortPair } from '../fixtures/native_port.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';
import { fixtureFrameFingerprint } from '../fixtures/frame_fingerprint.ts';

const open = { version: 1, method: 'center.open' };
const tick = async () => { for (let i = 0; i < 96; i++) await Promise.resolve(); };
function fixture() {
    const h = browserFixture(); const handle = vi.fn(async (_value: unknown, _sender: Sender, _source: Readonly<object>) => ({ state: 'ready' }));
    const release = vi.fn(); const host = new CenterChannelHost(h.api.runtime, { handle, release }, fixtureFrameFingerprint);
    const connect = (sender: Sender = CENTER_SENDER, name = 'copilot.center.v1') => {
        const pair = nativePortPair(name, sender); const replies: unknown[] = []; pair.client.onMessage.addListener(value => replies.push(value));
        for (const listener of h.onConnect.listeners) listener(pair.server);
        return { ...pair, replies, send: (sequence = 1, message: unknown = open) => pair.client.postMessage({ sequence, message }) };
    };
    return { ...h, handle, release, host, connect };
}
it.each([
    ['foreign extension', { ...CENTER_SENDER, id: 'foreign' }],
    ['content script', { ...CENTER_SENDER, url: 'https://github.com/octo/example/issues/1' }],
    ['subframe', { ...CENTER_SENDER, frameId: 1 }],
    ['private tab', { ...CENTER_SENDER, tab: { id: 1, incognito: true } }],
    ['foreign origin', { ...CENTER_SENDER, origin: 'https://foreign.invalid' }],
    ['query', { ...CENTER_SENDER, url: 'chrome-extension://test/runtime.html?private=1' }],
    ['invalid document', { ...CENTER_SENDER, documentId: '' }],
    ['invalid tab', { ...CENTER_SENDER, tab: { id: -1 } }],
])('native host rejects %s before registering a source or accepting work', async (_name, sender) => {
    const h = fixture(); const pair = h.connect(sender); await tick();
    expect(pair.live()).toBe(false); expect(h.handle).not.toHaveBeenCalled(); expect(h.release).not.toHaveBeenCalled(); h.host.stop();
});
it('native host rejects an unknown port version without attaching request listeners', () => {
    const h = fixture(); const pair = h.connect(CENTER_SENDER, 'copilot.center.v2');
    expect(pair.serverMessages.listeners.size).toBe(0); expect(pair.live()).toBe(false); h.host.stop();
});
it('native host requires sender metadata to exist, without manufacturing a tab or document', () => {
    const h = fixture(); const pair = nativePortPair('copilot.center.v1', CENTER_SENDER);
    for (const listener of h.onConnect.listeners) listener({ ...pair.server, sender: undefined });
    expect(pair.live()).toBe(false); expect(h.handle).not.toHaveBeenCalled(); h.host.stop();
});
it('native host forwards closed requests with an unexported source, never a serialized source field', async () => {
    const h = fixture(); const pair = h.connect(); pair.send(); await tick();
    expect(h.handle).toHaveBeenCalledWith(open, CENTER_SENDER, expect.any(Object));
    const source = h.handle.mock.calls[0][2]; expect(Object.isFrozen(source)).toBe(true);
    expect(pair.replies).toEqual([{ sequence: 1, result: { state: 'ready' } }]); expect(JSON.stringify(pair.replies)).not.toContain('source'); h.host.stop();
});
it('native host gives identical native metadata on separate ports different private sources', async () => {
    const h = fixture(); const first = h.connect(); const second = h.connect(); first.send(); second.send(); await tick();
    expect(h.handle.mock.calls[0][2]).not.toBe(h.handle.mock.calls[1][2]); h.host.stop();
});
it('native host admits missing optional document/tab facts only as a distinct native source', async () => {
    const h = fixture(); const pair = h.connect({ id: 'test', url: 'chrome-extension://test/runtime.html' }); pair.send(); await tick();
    expect(h.handle).toHaveBeenCalledOnce(); h.host.stop();
});
it('native host rejects a duplicate correlation without executing it again', async () => {
    const h = fixture(); const pair = h.connect(); pair.send(); await tick();
    pair.send(1, { version: 1, method: 'center.read', clientId: 'a'.repeat(32) }); await tick();
    expect(h.handle).toHaveBeenCalledOnce(); expect(h.release).toHaveBeenCalledOnce(); expect(pair.live()).toBe(false); h.host.stop();
});
it('native host rejects malformed envelopes before dispatch and releases the native source', async () => {
    const h = fixture(); const pair = h.connect(); pair.client.postMessage({ sequence: 1, message: open, source: {} }); await tick();
    expect(h.handle).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalledOnce(); h.host.stop();
});
it('native host drops late results after disconnect and removes all source listeners', async () => {
    const h = fixture(); const wait = deferred<{ state: string }>(); h.handle.mockImplementation(() => wait.promise);
    const pair = h.connect(); pair.send(); await tick(); pair.client.disconnect(); await tick(); wait.resolve({ state: 'ready' }); await tick();
    expect(pair.replies).toEqual([]); expect(h.release).toHaveBeenCalledOnce(); expect(pair.serverMessages.listeners.size).toBe(0); expect(pair.serverLost.listeners.size).toBe(0); h.host.stop();
});
it('native host caps simultaneous unfinished requests and never dispatches excess work', async () => {
    const h = fixture(); const wait = deferred<{ state: string }>(); h.handle.mockImplementation(() => wait.promise); const pair = h.connect();
    for (let sequence = 1; sequence <= 17; sequence++) pair.send(sequence); await tick();
    expect(h.handle).toHaveBeenCalledTimes(16); expect(pair.live()).toBe(false); wait.resolve({ state: 'ready' }); await tick(); expect(pair.replies).toEqual([]); h.host.stop();
});
it('native host caps accepted ports and admits a replacement only after native retirement', async () => {
    const h = fixture(); const accepted = Array.from({ length: 8 }, () => h.connect()); const refused = h.connect(); expect(refused.live()).toBe(false);
    accepted[0].client.disconnect(); await tick(); const replacement = h.connect(); replacement.send(); await tick();
    expect(h.handle).toHaveBeenCalledOnce(); h.host.stop();
});
it('native host tab removal disconnects matching sources while preserving another window', async () => {
    const h = fixture(); const first = h.connect(); const second = h.connect({ ...CENTER_SENDER, tab: { id: 2 } });
    h.host.releaseTab(1); second.send(); await tick(); expect(first.live()).toBe(false); expect(second.live()).toBe(true); expect(h.handle).toHaveBeenCalledOnce(); h.host.stop();
});
it('native host contains application rejection and retires instead of sending raw exceptions', async () => {
    const h = fixture(); h.handle.mockRejectedValue(new Error('private-application-error')); const pair = h.connect(); pair.send(); await tick();
    expect(pair.live()).toBe(false); expect(pair.replies).toEqual([]); h.host.stop();
});
it('native host rejects a malformed application response without promoting an invalid payload', async () => {
    const h = fixture(); h.handle.mockResolvedValue(null as unknown as { state: string }); const pair = h.connect(); pair.send(); await tick();
    expect(pair.live()).toBe(false); expect(pair.replies).toEqual([]); h.host.stop();
});
it('native host contains failed posting and failed native disconnect after synchronous source retirement', async () => {
    const h = fixture(); const pair = h.connect(); vi.mocked(pair.server.postMessage).mockImplementation(() => { throw new Error('private-post-error'); });
    vi.mocked(pair.server.disconnect).mockImplementation(() => { throw new Error('already closed'); }); pair.send(); await tick();
    expect(h.release).toHaveBeenCalledOnce(); expect(pair.serverMessages.listeners.size).toBe(0); h.host.stop(); pair.client.disconnect();
});
it('native host stop unregisters wake listener, retires every source once and ignores an already queued connection', async () => {
    const h = fixture(); const late = [...h.onConnect.listeners][0]; const pair = h.connect();
    const lateMessage = [...pair.serverMessages.listeners][0]; const lateLost = [...pair.serverLost.listeners][0];
    h.host.stop(); h.host.stop(); expect(h.release).toHaveBeenCalledOnce(); expect(h.onConnect.listeners.size).toBe(0);
    lateMessage({ sequence: 1, message: open }); lateLost(); expect(h.release).toHaveBeenCalledOnce(); expect(h.handle).not.toHaveBeenCalled();
    const queued = nativePortPair('copilot.center.v1', CENTER_SENDER); late(queued.server); expect(queued.live()).toBe(false); expect(pair.live()).toBe(false); await tick();
});
