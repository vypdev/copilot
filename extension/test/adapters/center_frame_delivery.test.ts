import { expect, it, vi } from 'vitest';
import { CenterFrameDelivery, CENTER_DELIVERY_CAPACITY } from '../../src/adapters/browser/center_frame_delivery.ts';
import { centerRequestFrame } from '../../src/domain/center_channel.ts';
import { fixtureFrameFingerprint } from '../fixtures/frame_fingerprint.ts';
import { deferred } from '../fixtures/runtime.ts';

const input = (sequence = 1) => ({ sequence, message: { version: 1, method: 'center.open' } });
const tick = async () => { for (let index = 0; index < 128; index++) await Promise.resolve(); };
function fixture() {
    const parse = vi.fn(centerRequestFrame); const deliver = vi.fn(); const failure = vi.fn(); const fingerprint = vi.fn(fixtureFrameFingerprint);
    const frames = new CenterFrameDelivery(parse, deliver, failure, fingerprint);
    return { parse, deliver, failure, fingerprint, frames };
}
it('distinct native copies of one request dispatch exactly once before and after completion', async () => {
    const h = fixture(); h.frames.receive(input()); h.frames.receive(structuredClone(input())); await tick();
    h.frames.receive(structuredClone(input())); await tick(); expect(h.deliver).toHaveBeenCalledExactlyOnceWith(input()); expect(h.failure).not.toHaveBeenCalled(); h.frames.stop();
});
it('equivalent JSON key ordering cannot turn a native copy into a collision', async () => {
    const h = fixture(); h.frames.receive(input()); h.frames.receive({ message: { method: 'center.open', version: 1 }, sequence: 1 }); await tick();
    expect(h.deliver).toHaveBeenCalledOnce(); expect(h.failure).not.toHaveBeenCalled(); h.frames.stop();
});
it('changed content under an observed correlation retires instead of repeating or replacing the original request', async () => {
    const h = fixture(); h.frames.receive(input());
    h.frames.receive({ sequence: 1, message: { version: 1, method: 'center.read', clientId: 'a'.repeat(32) } }); await tick();
    expect(h.deliver).toHaveBeenCalledExactlyOnceWith(input()); expect(h.failure).toHaveBeenCalledOnce();
    h.frames.receive(input(2)); await tick(); expect(h.deliver).toHaveBeenCalledOnce();
});
it('malformed input and caller-supplied fingerprint authority fail before hashing', () => {
    const h = fixture(); h.frames.receive({ ...input(), fingerprint: 'a'.repeat(64) });
    expect(h.fingerprint).not.toHaveBeenCalled(); expect(h.deliver).not.toHaveBeenCalled(); expect(h.failure).toHaveBeenCalledOnce();
});
it('a decoder fault retires the source without escaping through the native callback', () => {
    const h = fixture(); h.parse.mockImplementationOnce(() => { throw new Error('private decoder failure'); });
    expect(() => h.frames.receive(input())).not.toThrow(); expect(h.failure).toHaveBeenCalledOnce(); expect(h.fingerprint).not.toHaveBeenCalled();
});
it('native fingerprint rejection clears later queued work without a fallback or semantic dispatch', async () => {
    const h = fixture(); h.fingerprint.mockRejectedValueOnce(new Error('private crypto failure'));
    h.frames.receive(input()); h.frames.receive(input(2)); await tick();
    expect(h.fingerprint).toHaveBeenCalledOnce(); expect(h.deliver).not.toHaveBeenCalled(); expect(h.failure).toHaveBeenCalledOnce();
});
it('an absent fingerprint cannot establish a new or duplicate delivery', async () => {
    const h = fixture(); h.fingerprint.mockResolvedValueOnce(null); h.frames.receive(input()); await tick();
    expect(h.deliver).not.toHaveBeenCalled(); expect(h.failure).toHaveBeenCalledOnce();
});
it('non-SHA-256 output from a failed provider cannot pass the transport window', async () => {
    const h = fixture(); h.fingerprint.mockResolvedValueOnce('not-a-digest'); h.frames.receive(input()); await tick();
    expect(h.deliver).not.toHaveBeenCalled(); expect(h.failure).toHaveBeenCalledOnce();
});
it('hashing preserves arrival order while a later native event waits for its own turn', async () => {
    const h = fixture(); const wait = deferred<string | null>(); h.fingerprint.mockImplementationOnce(() => wait.promise);
    h.frames.receive(input()); h.frames.receive(input(2)); expect(h.fingerprint).toHaveBeenCalledOnce(); expect(h.deliver).not.toHaveBeenCalled();
    wait.resolve(await fixtureFrameFingerprint(input())); await tick();
    expect(h.deliver.mock.calls.map(([frame]) => frame.sequence)).toEqual([1, 2]); expect(h.failure).not.toHaveBeenCalled(); h.frames.stop();
});
it('retirement during hashing drops both the delayed result and queued frames without reviving the source', async () => {
    const h = fixture(); const wait = deferred<string | null>(); h.fingerprint.mockImplementationOnce(() => wait.promise);
    h.frames.receive(input()); h.frames.receive(input(2)); h.frames.stop(); h.frames.stop(); h.frames.receive(input(3));
    wait.resolve(await fixtureFrameFingerprint(input())); await tick();
    expect(h.deliver).not.toHaveBeenCalled(); expect(h.failure).not.toHaveBeenCalled(); expect(h.parse).toHaveBeenCalledTimes(2); expect(h.fingerprint).toHaveBeenCalledOnce();
});
it('a native hashing rejection arriving after retirement cannot invoke its old failure observer', async () => {
    const h = fixture(); let reject!: (reason: Error) => void;
    h.fingerprint.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    h.frames.receive(input()); h.frames.stop(); reject(new Error('late native failure')); await tick();
    expect(h.failure).not.toHaveBeenCalled(); expect(h.deliver).not.toHaveBeenCalled();
});
it('exactly thirty-two native arrivals fit the hashing queue without exceeding its fixed budget', async () => {
    const h = fixture(); const wait = deferred<string | null>(); h.fingerprint.mockImplementationOnce(() => wait.promise);
    for (let sequence = 1; sequence <= CENTER_DELIVERY_CAPACITY; sequence++) h.frames.receive(input(sequence));
    expect(h.failure).not.toHaveBeenCalled(); wait.resolve(await fixtureFrameFingerprint(input())); await tick();
    expect(h.deliver).toHaveBeenCalledTimes(CENTER_DELIVERY_CAPACITY); expect(h.failure).not.toHaveBeenCalled(); h.frames.stop();
});
it('the next native arrival over capacity retires before delayed work can execute', async () => {
    const h = fixture(); const wait = deferred<string | null>(); h.fingerprint.mockImplementationOnce(() => wait.promise);
    for (let sequence = 1; sequence <= CENTER_DELIVERY_CAPACITY + 1; sequence++) h.frames.receive(input(sequence));
    expect(h.failure).toHaveBeenCalledOnce(); wait.resolve(await fixtureFrameFingerprint(input())); await tick();
    expect(h.deliver).not.toHaveBeenCalled(); expect(h.fingerprint).toHaveBeenCalledOnce();
});
it('a semantic delivery exception retires remaining work without leaking its provider error', async () => {
    const h = fixture(); h.deliver.mockImplementationOnce(() => { throw new Error('private dispatch failure'); });
    h.frames.receive(input()); h.frames.receive(input(2)); await tick();
    expect(h.deliver).toHaveBeenCalledOnce(); expect(h.failure).toHaveBeenCalledOnce(); expect(h.fingerprint).toHaveBeenCalledOnce();
});
it('a failing retirement observer cannot escape or allow another native frame through', () => {
    const h = fixture(); h.failure.mockImplementation(() => { throw new Error('private observer failure'); });
    expect(() => h.frames.receive(null)).not.toThrow(); h.frames.receive(input()); expect(h.failure).toHaveBeenCalledOnce(); expect(h.parse).toHaveBeenCalledOnce();
});
it('reentrant arrivals created by a completed dispatch are processed without losing the queue wakeup', async () => {
    const h = fixture(); h.deliver.mockImplementationOnce(() => h.frames.receive(input(2))); h.frames.receive(input()); await tick();
    expect(h.deliver.mock.calls.map(([frame]) => frame.sequence)).toEqual([1, 2]); expect(h.failure).not.toHaveBeenCalled(); h.frames.stop();
});
it('a fresh native source has its own fingerprint window despite a reused correlation number', async () => {
    const old = fixture(); old.frames.receive(input()); await tick(); old.frames.stop();
    const next = fixture(); next.frames.receive(input()); await tick();
    expect(next.deliver).toHaveBeenCalledOnce(); expect(next.failure).not.toHaveBeenCalled(); next.frames.stop();
});
