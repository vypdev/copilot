import { expect, it, vi } from 'vitest';
import { HistoryReader } from '../../src/application/history_reader.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { HistoryRequest } from '../../src/domain/history_request.ts';

it('a late invalidated read and older same-epoch/cleared data cannot restore previous rows', async () => {
    const f = await historyWireExamples(); const request = vi.fn(async (_input: HistoryRequest) => f.active as unknown as Record<string, unknown>);
    const reader = new HistoryReader({ request, changed: vi.fn() }); await reader.read('diagnostics'); expect(reader.view.diagnostics.current).toBe(true);
    request.mockResolvedValueOnce(f.off as unknown as Record<string, unknown>); await reader.read('diagnostics'); expect(reader.view.diagnostics).toMatchObject({ current: false, data: null, phase: 'unavailable' });
    const gate = deferred<Record<string, unknown>>(); request.mockReturnValueOnce(gate.promise); const pending = reader.read('diagnostics'); await Promise.resolve();
    reader.anchor('diagnostics', 1, 2); request.mockResolvedValueOnce(f.clearedDocument as unknown as Record<string, unknown>); void reader.read('diagnostics');
    gate.resolve(f.active as unknown as Record<string, unknown>); await pending;
    expect(reader.view.diagnostics.data?.retained).toMatchObject({ snapshot: { entries: [], epoch: 1 } });
    const before = reader.view; reader.anchor('diagnostics', 0, 0); expect(reader.view).toBe(before); reader.stop();
    reader.invalidate(); reader.anchor('diagnostics', 1, 1); expect(reader.view.diagnostics.data).toBeNull();
});
it('coalesces bursts into one trailing request per collection and keeps exactly one read in flight', async () => {
    const f = await historyWireExamples(); const entered = deferred<void>(); const release = deferred<void>(); let active = 0; let peak = 0; let first = true;
    const recents = { ...f.off, kind: 'recents', collection: { ...f.off.collection, kind: 'recents' }, writer: { ...f.off.writer, kind: 'recents' },
        retained: { state: 'ready', snapshot: { ...(f.off.retained.state === 'ready' ? f.off.retained.snapshot : {}), kind: 'recents' } } };
    const request = vi.fn(async (input: HistoryRequest) => {
        active++; peak = Math.max(peak, active); if (first) { first = false; entered.resolve(); await release.promise; }
        active--; return (input.method === 'center.history.read' && input.kind === 'recents' ? recents : f.off) as unknown as Record<string, unknown>;
    });
    const reader = new HistoryReader({ request, changed: vi.fn() }); const pending = reader.read('diagnostics'); await entered.promise;
    for (let i = 0; i < 5; i++) { void reader.read('diagnostics'); void reader.read('recents'); }
    release.resolve(); await pending; expect(request).toHaveBeenCalledTimes(3); expect(peak).toBe(1); expect(reader.view.recents.current).toBe(true);
});
it('retirement during synchronous notification prevents a new native read', async () => {
    const request = vi.fn(); const reader: HistoryReader = new HistoryReader({ request, changed: () => { if (reader.view.diagnostics.phase === 'reading') reader.stop(); } });
    await reader.read('diagnostics'); expect(request).not.toHaveBeenCalled(); await reader.read('recents'); expect(request).not.toHaveBeenCalled();
});
it('provider, subscriber and wrong-kind failures stay isolated to read availability', async () => {
    const f = await historyWireExamples(); const request = vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValue(f.off);
    const reader = new HistoryReader({ request, changed: () => { throw new Error('private'); } });
    await reader.read('diagnostics'); expect(reader.view.diagnostics.phase).toBe('unavailable'); await reader.read('recents'); expect(reader.view.recents.phase).toBe('unavailable');
    await reader.read('diagnostics'); expect(reader.view.diagnostics.phase).toBe('ready'); reader.invalidate(); expect(reader.view.diagnostics.data).toBeNull();
});
it('synchronous read invalidation also prevents I/O without stopping the remaining collection owner', async () => {
    const request = vi.fn(); const reader: HistoryReader = new HistoryReader({ request, changed: () => { if (reader.view.diagnostics.phase === 'reading') reader.invalidate('diagnostics'); } });
    await reader.read('diagnostics'); expect(request).not.toHaveBeenCalled(); reader.stop();
});
it('known consent remains inspectable when the store cannot establish any history generation', async () => {
    const f = await historyWireExamples(); const data = { ...f.off, writer: { ...f.off.writer, epoch: null, observedRevision: null }, retained: { state: 'unavailable' } };
    const reader = new HistoryReader({ request: vi.fn(async () => data), changed: vi.fn() }); await reader.read('diagnostics');
    expect(reader.view.diagnostics).toMatchObject({ phase: 'ready', current: true, data: { collection: { preference: 'off' }, retained: { state: 'unavailable' }, writer: { epoch: null } } }); reader.stop();
});
