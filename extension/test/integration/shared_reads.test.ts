import { expect, it, vi } from 'vitest';
import { SharedReadCancellation } from '../../src/application/shared_read_cancellation.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { sessionHarness, deferred } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

const active = { visible: true, active: true, online: true, pending: false, manual: true };
const success = { state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 } as const;
it('shared transport retains live consumers, detaches listeners exactly once and permits immediate cancellation registration races', () => {
    const shared = new SharedReadCancellation(); const first = new BrowserCancellation(); const second = new BrowserCancellation();
    const observe = vi.fn(); const unsubscribe = shared.onAbort(observe); unsubscribe();
    const remaining = vi.fn(); shared.onAbort(remaining);
    const leave = shared.join(first)!; shared.join(second); first.abort(); leave(); expect(shared.aborted).toBe(false);
    second.abort(); expect(shared.aborted).toBe(true); expect(remaining).toHaveBeenCalledTimes(1); expect(observe).not.toHaveBeenCalled();
    const late = vi.fn(); shared.onAbort(late)(); expect(late).toHaveBeenCalledTimes(1); expect(shared.join(first)).toBe(null);
    shared.dispose(); shared.abort();
    const synchronous = new SharedReadCancellation(); const alreadyGone = new BrowserCancellation(); alreadyGone.abort();
    synchronous.join(alreadyGone)!(); expect(synchronous.aborted).toBe(true); synchronous.dispose();
});
it('shared subscriptions have a fixed 128-consumer bound and disposal removes all remaining subscriptions', () => {
    const shared = new SharedReadCancellation(); const detached = vi.fn();
    for (let i = 0; i < 128; i++) expect(shared.join({ aborted: false, onAbort: () => detached })).not.toBe(null);
    expect(shared.join(new BrowserCancellation())).toBe(null); shared.dispose(); expect(detached).toHaveBeenCalledTimes(128);
});
it('one tab leaving a coalesced read cannot abort another live tab, and either canceled caller receives only an aborted result', async () => {
    for (const canceled of ['first', 'second']) {
        const h = sessionHarness(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
        const first = new BrowserCancellation(); const second = new BrowserCancellation();
        const run = (owner: BrowserCancellation) => h.scheduler.run('shared', 'repo', { type: 'viewer' }, 'synthetic', owner, active);
        const a = run(first); const b = run(second); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
        (canceled === 'first' ? first : second).abort(); expect(vi.mocked(h.reader.read).mock.calls[0][2].aborted).toBe(false);
        pending.resolve(success); expect(await a).toEqual(canceled === 'first' ? { state: 'aborted', bytes: 0 } : success);
        expect(await b).toEqual(canceled === 'second' ? { state: 'aborted', bytes: 0 } : success);
    }
});
it('all canceled consumers terminate transport, late joiners cannot revive it and hidden requests cannot bypass activity checks', async () => {
    const h = sessionHarness(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const source = new BrowserCancellation(); const run = (owner: BrowserCancellation, visible = true) => h.scheduler.run('shared', 'repo', { type: 'viewer' }, 'synthetic', owner, { ...active, visible });
    const first = run(source); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    expect(await run(new BrowserCancellation(), false)).toMatchObject({ state: 'inactive' }); source.abort();
    expect(vi.mocked(h.reader.read).mock.calls[0][2].aborted).toBe(true);
    expect(await run(new BrowserCancellation())).toMatchObject({ state: 'aborted' }); pending.resolve(success);
    expect(await first).toMatchObject({ state: 'aborted' });
});
it('scheduler coalescing bounds fanout while global invalidation aborts every shared transport', async () => {
    const h = sessionHarness(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const run = () => h.scheduler.run('shared', 'repo', { type: 'viewer' }, 'synthetic', new BrowserCancellation(), active);
    const consumers = Array.from({ length: 128 }, run); expect(await run()).toMatchObject({ state: 'busy' });
    await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1)); h.scheduler.invalidate(); pending.resolve(success);
    for (const result of await Promise.all(consumers)) expect(result).toMatchObject({ state: 'aborted' });
});

it('a canceled reservation cannot send a provider request after its protected quota write finally completes', async () => {
    const h = sessionHarness(); const reservation = deferred<void>(); vi.mocked(h.port.set).mockReturnValueOnce(reservation.promise);
    const source = new BrowserCancellation(); const read = h.scheduler.run('queued', 'repo', { type: 'viewer' }, 'synthetic', source, active);
    await vi.waitFor(() => expect(h.port.set).toHaveBeenCalledTimes(1)); source.abort(); reservation.resolve();
    expect(await read).toMatchObject({ state: 'aborted' }); expect(h.reader.read).not.toHaveBeenCalled();
});
