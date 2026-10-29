import { expect, it, vi } from 'vitest';
import { HistoryReviewClient } from '../../src/application/history_review_client.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { deferred } from '../fixtures/runtime.ts';
import { historyResultPhase } from '../../src/domain/history_review_projection.ts';

async function fixture() {
    const f = await historyWireExamples(); if (f.start.state !== 'preview' || f.clear.state !== 'preview') throw new Error('missing');
    const ports = { request: vi.fn(async (_message: unknown): Promise<unknown> => f.start), now: vi.fn(() => f.start.state === 'preview' ? f.start.expiresAt - 1 : 0), canMutate: vi.fn(() => true), changed: vi.fn() };
    const observed = vi.fn(); const client = new HistoryReviewClient(ports, observed); return { ...f, start: f.start, clear: f.clear, client, ports, observed };
}
it('invalid, wrong-kind/action, malformed and throwing preview responses never retain a native selector', async () => {
    const f = await fixture();
    for (const response of [{ state: 'denied' }, { state: 'unavailable' }, null, { ...f.start, kind: 'recents' }, { ...f.start, action: 'stop' }]) {
        f.ports.request.mockResolvedValueOnce(response); await f.client.preview('collection', 'diagnostics'); expect(f.client.view.review).toBeNull(); expect(f.client.view.busy).toBe(false);
    }
    f.ports.request.mockRejectedValueOnce(new Error('private')); await f.client.preview('collection', 'diagnostics'); expect(f.client.view.issue).toBe('unavailable');
    f.ports.now.mockImplementationOnce(() => { throw new Error('private'); }); await f.client.preview('collection', 'diagnostics'); expect(f.client.view.review).toBeNull();
});
it('eligibility can be lost after preview; cancellation stays separate and clear-family cancellation never submits clear', async () => {
    const f = await fixture(); await f.client.confirm(); await f.client.cancel(); await f.client.inspect();
    await f.client.preview('collection', 'diagnostics'); f.ports.canMutate.mockReturnValue(false); const count = f.ports.request.mock.calls.length; await f.client.confirm();
    expect(f.client.view.issue).toBe('denied'); expect(f.ports.request).toHaveBeenCalledTimes(count); f.ports.request.mockResolvedValueOnce({ state: 'cancelled' }); await f.client.cancel(); expect(f.client.view.review?.outcome?.state).toBe('cancelled');
    await f.client.dismiss(); f.ports.canMutate.mockReturnValue(true); f.ports.request.mockResolvedValueOnce(f.clear); await f.client.preview('clear', 'diagnostics');
    f.ports.request.mockResolvedValueOnce({ state: 'cancelled' }); await f.client.cancel(); expect(f.ports.request.mock.calls.at(-1)?.[0]).toMatchObject({ method: 'center.history.clear.cancel' });
    expect(historyResultPhase({ state: 'expired' })).toBe('stale');
});
it('source retirement ignores a late preview, confirmation or inspection and preserves only historical completed facts', async () => {
    const f = await fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise);
    const pending = f.client.preview('collection', 'diagnostics'); f.client.retire(); gate.resolve(f.start); await pending; expect(f.client.view.review).toBeNull();
    await f.client.preview('collection', 'diagnostics'); const confirmGate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(confirmGate.promise); const confirming = f.client.confirm();
    const readGate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(readGate.promise); const reading = f.client.inspect(); f.client.retire();
    confirmGate.resolve(f.started); readGate.resolve(f.started); await Promise.all([confirming, reading]); expect(f.client.view.review?.phase).toBe('stale'); expect(f.client.view.busy).toBe(false);
    f.client.stop(); f.client.retire(); expect(await f.client.dismiss()).toBe(false); await f.client.confirm();
});
it('a stopped or still-cancelling review cannot be dismissed as if its native request had returned', async () => {
    const f = await fixture(); await f.client.preview('collection', 'diagnostics'); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise);
    const cancelling = f.client.cancel(); expect(await f.client.dismiss()).toBe(false); const count = f.ports.request.mock.calls.length;
    await f.client.confirm(); expect(f.ports.request).toHaveBeenCalledTimes(count); gate.resolve({ state: 'cancelled' }); await cancelling;
    expect(await f.client.dismiss()).toBe(true); f.ports.changed.mockImplementation(() => { throw new Error('private'); }); await f.client.preview('collection', 'diagnostics'); expect(f.client.view.review?.phase).toBe('preview');
});
it('pending inspection leaves the original submission busy and stops a second result read until its response returns', async () => {
    const f = await fixture(); await f.client.preview('collection', 'diagnostics'); const effect = deferred<unknown>(); f.ports.request.mockReturnValueOnce(effect.promise); const confirming = f.client.confirm();
    const read = deferred<unknown>(); f.ports.request.mockReturnValueOnce(read.promise); const checking = f.client.inspect(); const count = f.ports.request.mock.calls.length;
    await f.client.inspect(); expect(f.ports.request).toHaveBeenCalledTimes(count); read.resolve({ state: 'pending' }); await checking;
    expect(f.client.view.busy).toBe(true); f.observed.mockImplementation(() => { throw new Error('private'); }); effect.resolve(f.started); await confirming; expect(f.client.view.review?.phase).toBe('result');
});
it('failed or weaker checks retain an acknowledged uncertain clear, while an explicitly verified clear can strengthen it', async () => {
    const f = await fixture(); f.ports.request.mockResolvedValueOnce(f.clear); await f.client.preview('clear', 'diagnostics');
    f.ports.request.mockResolvedValueOnce({ state: 'unknown', acknowledgement: 'accepted', observation: 'changed', sourceCurrentAtObservation: false }); await f.client.confirm();
    const known = f.client.view.review; f.ports.request.mockResolvedValueOnce({ state: 'expired' }); await f.client.inspect(); expect(f.client.view.review).toBe(known);
    f.ports.request.mockResolvedValueOnce({ ...f.cleared, epoch: f.clear.epoch + 1, revision: f.clear.revision + 1 }); await f.client.inspect(); expect(f.client.view.review?.outcome?.state).toBe('observed-cleared');
});
it('a pending native cancellation leaves dismissal guarded instead of pretending the review was cancelled', async () => {
    const f = await fixture(); await f.client.preview('collection', 'diagnostics'); f.ports.request.mockResolvedValueOnce({ state: 'pending' });
    expect(await f.client.dismiss()).toBe(false); expect(f.client.view.busy).toBe(true); expect(f.client.view.review?.outcome?.state).toBe('pending'); f.client.stop();
});
it('a well-formed response for another target or clear generation cannot settle this reviewed operation', async () => {
    const f = await fixture(); if (f.started.state !== 'settled') throw new Error('missing'); await f.client.preview('collection', 'diagnostics');
    f.ports.request.mockResolvedValueOnce({ ...f.started, kind: 'recents' }); await f.client.confirm(); expect(f.client.view.issue).toBe('unavailable'); expect(f.client.view.review?.outcome).toBeNull();
    await f.client.dismiss(); f.ports.request.mockResolvedValueOnce(f.clear); await f.client.preview('clear', 'diagnostics');
    f.ports.request.mockResolvedValueOnce({ ...f.cleared, epoch: f.clear.epoch, revision: f.clear.revision }); await f.client.confirm(); expect(f.client.view.review?.phase).toBe('unknown');
});
