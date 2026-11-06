import { expect, it, vi } from 'vitest';
import { HistoryClient } from '../../src/application/history_client.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { historyClientFixture } from '../fixtures/history_client.ts';
import { deferred } from '../fixtures/runtime.ts';

it('bounds subscribers and isolates throwing initial and later deliveries without changing an observed read', async () => {
    const f = await historyClientFixture(); const failing = vi.fn(() => { throw new Error('private'); }); const unsubscribe = f.client.subscribe(failing);
    const remove = Array.from({ length: 7 }, () => f.client.subscribe(vi.fn())); expect(() => f.client.subscribe(vi.fn())).toThrow('history-subscriber-capacity');
    await f.client.reader.read('diagnostics'); expect(f.client.view.slots.diagnostics.current).toBe(true); expect(failing.mock.calls.length).toBeGreaterThan(1);
    unsubscribe(); remove.forEach(fn => fn()); f.stop(); f.stop(); f.client.reader.invalidate();
});
it('keeps native download and completion callbacks retired after the mounted owner stops', async () => {
    const f = await historyWireExamples(); const gate = deferred<boolean>();
    const client = new HistoryClient({ now: () => 0, canMutate: () => true, request: vi.fn(async () => f.off as unknown as Record<string, unknown>), download: vi.fn(() => gate.promise) });
    await client.reader.read('diagnostics'); expect(client.exports.preview('diagnostics')).toBe(true); const pending = client.exports.download(); client.stop(); gate.resolve(true); await pending;
    expect(client.view.exportReview).toBeNull(); expect(client.view.slots.diagnostics.data).toBeNull();
});
it('omitting a native download port never invents a saved file or accepts a simultaneous collection review', async () => {
    const f = await historyClientFixture(); await f.client.reader.read('diagnostics'); f.client.exports.preview('diagnostics'); const count = f.ports.request.mock.calls.length;
    await f.client.reviews.preview('clear', 'diagnostics'); expect(f.client.view.issue).toBe('denied'); expect(f.ports.request).toHaveBeenCalledTimes(count);
    expect(await f.client.exports.download()).toBe(false); expect(f.client.view.exportFailed).toBe(true); f.stop();
});
