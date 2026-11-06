import { expect, it, vi } from 'vitest';
import { HistoryExportClient } from '../../src/application/history_export_client.ts';
import { previewHistoryExport } from '../../src/domain/history_export.ts';
import { historyClientFixture } from '../fixtures/history_client.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { deferred } from '../fixtures/runtime.ts';

it('requires a current retained snapshot and a separate download gesture against the exact reviewed bytes', async () => {
    const f = await historyWireExamples(); if (f.active.retained.state !== 'ready') throw new Error('missing-snapshot'); const snapshot = f.active.retained.snapshot;
    const ports = { snapshot: vi.fn(() => snapshot), available: vi.fn(() => true), download: vi.fn(async () => true), changed: vi.fn() };
    const client = new HistoryExportClient(ports); expect(await client.download()).toBe(false); expect(client.preview('diagnostics')).toBe(true);
    const review = client.review!; expect(Object.isFrozen(review)).toBe(true); expect(JSON.parse(review.content)).toEqual({ schemaVersion: 1, kind: 'diagnostics', history: snapshot });
    expect(ports.download).not.toHaveBeenCalled(); expect(await client.download()).toBe(true); expect(ports.download).toHaveBeenCalledExactlyOnceWith('diagnostics', review.content); expect(client.review).toBeNull();
    expect(previewHistoryExport('recents', snapshot)).toBeNull(); expect(previewHistoryExport('bad' as never, { ...snapshot, kind: 'bad' } as never)).toBeNull();
    expect(previewHistoryExport('diagnostics', { get schemaVersion() { throw new Error('private'); } } as never)).toBeNull();
    expect(previewHistoryExport('diagnostics', 'x'.repeat(65536))).toBeNull();
    const changing = { ...snapshot, entries: Object.assign([...snapshot.entries], { toJSON: () => [{ credentials: 'excluded' }] }) };
    expect(previewHistoryExport('diagnostics', changing)).toBeNull();
});
it('retires a displayed export immediately when its actual reader is invalidated or clear advances its generation', async () => {
    const f = await historyClientFixture(); await f.client.reader.read('diagnostics'); expect(f.client.exports.preview('diagnostics')).toBe(true);
    f.client.reader.invalidate('diagnostics'); f.client.exports.invalidate(); expect(f.client.view.exportReview).toBeNull();
    await f.client.reader.read('diagnostics'); f.client.exports.preview('diagnostics'); f.client.reader.anchor('diagnostics', 1, 1); expect(f.client.view.exportReview).toBeNull();
    expect(await f.client.exports.download()).toBe(false); f.stop();
});
it('blocks a concurrent review/download and retains the reviewed bytes only when the download is not established', async () => {
    const f = await historyWireExamples(); if (f.off.retained.state !== 'ready') throw new Error('missing');
    const gate = deferred<boolean>(); const ports = { snapshot: vi.fn(() => f.off.retained.state === 'ready' ? f.off.retained.snapshot : null), available: vi.fn(() => true), download: vi.fn(() => gate.promise), changed: vi.fn() };
    const client = new HistoryExportClient(ports); client.preview('diagnostics'); const review = client.review; const pending = client.download();
    expect(client.busy).toBe(true); expect(client.preview('diagnostics')).toBe(false); expect(await client.download()).toBe(false); expect(ports.download).toHaveBeenCalledOnce();
    gate.resolve(false); expect(await pending).toBe(false); expect(client.review).toBe(review); expect(client.busy).toBe(false);
    ports.available.mockReturnValue(false); expect(await client.download()).toBe(false); expect(client.review).toBeNull();
});
it('does not hand a download to native I/O after synchronous retirement, changed snapshots or failed boundaries', async () => {
    const f = await historyWireExamples(); if (f.off.retained.state !== 'ready') throw new Error('missing'); const snapshot = f.off.retained.snapshot;
    const ports = { snapshot: vi.fn(() => snapshot), available: vi.fn(() => true), download: vi.fn(async () => true), changed: vi.fn() }; const client = new HistoryExportClient(ports);
    ports.available.mockReturnValueOnce(false); expect(client.preview('diagnostics')).toBe(false);
    ports.snapshot.mockReturnValueOnce(null as never); expect(client.preview('diagnostics')).toBe(false);
    ports.snapshot.mockImplementationOnce(() => { throw new Error('private'); }); expect(client.preview('diagnostics')).toBe(false);
    client.preview('diagnostics'); ports.snapshot.mockReturnValueOnce({ ...snapshot, revision: 1 }); expect(await client.download()).toBe(false); expect(ports.download).not.toHaveBeenCalled();
    client.preview('diagnostics'); ports.snapshot.mockImplementationOnce(() => { throw new Error('private'); }); client.synchronize(); expect(client.review).toBeNull();
    client.preview('diagnostics'); ports.changed.mockImplementation(() => { if (client.busy) client.stop(); }); expect(await client.download()).toBe(false); expect(ports.download).not.toHaveBeenCalled();
    expect(client.preview('diagnostics')).toBe(false); expect(await client.download()).toBe(false);
});
it('boundary exceptions never pretend an export succeeded or erase the reviewed bytes', async () => {
    const f = await historyWireExamples(); if (f.off.retained.state !== 'ready') throw new Error('missing');
    const ports = { snapshot: vi.fn(() => f.off.retained.state === 'ready' ? f.off.retained.snapshot : null), available: vi.fn(() => true), download: vi.fn(async () => { throw new Error('private'); }), changed: vi.fn(() => { throw new Error('private'); }) };
    const client = new HistoryExportClient(ports); client.preview('diagnostics'); expect(await client.download()).toBe(false); expect(client.review).not.toBeNull(); expect(client.busy).toBe(false);
});
it.each(['failure', 'exception'])('a late download %s cannot resurrect or mark a retired export', async mode => {
    const f = await historyWireExamples(); if (f.off.retained.state !== 'ready') throw new Error('missing'); const snapshot = f.off.retained.snapshot;
    const gate = deferred<boolean>(); const client = new HistoryExportClient({ snapshot: () => snapshot, available: () => true, download: () => gate.promise, changed: vi.fn() });
    client.preview('diagnostics'); const pending = client.download(); client.invalidate();
    if (mode === 'failure') gate.resolve(false); else gate.reject(new Error('private')); expect(await pending).toBe(false); expect(client.review).toBeNull(); expect(client.failed).toBe(false);
});
