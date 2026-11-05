import { expect, it, vi } from 'vitest';
import { VisitDelivery, type CapturedVisit } from '../../src/application/visit_delivery.ts';
import { deferred } from '../fixtures/runtime.ts';

const value = (sequence = 1): CapturedVisit => ({ epoch: 0, message: { version: 1, method: 'center.recents.observe', clientId: 'a'.repeat(32), controllerEpoch: 1,
    credentialEpoch: 0, permit: `visit-${'b'.repeat(32)}`, sequence, destination: { route: 'privacy' } } });
function fixture() {
    const ports = { request: vi.fn(async (_message: CapturedVisit['message']): Promise<unknown> => ({ state: 'observed' })),
        valid: vi.fn((_value: CapturedVisit) => true), relevant: vi.fn((_value: CapturedVisit) => true), changed: vi.fn() };
    return { ports, queue: new VisitDelivery(ports) };
}
it('a synchronous validity failure records uncertainty only for its own still-relevant source', async () => {
    const f = fixture(); f.ports.valid.mockReturnValue(false); f.queue.observe(value()); await f.queue.flush();
    expect(f.queue.view).toEqual({ pending: 0, dropped: 1, incomplete: true }); expect(f.ports.request).not.toHaveBeenCalled();
    f.ports.relevant.mockReturnValue(false); f.queue.observe(value(2)); expect(f.queue.view.dropped).toBe(1);
});
it('reset or disposal reentering a notification cannot restore a replaced queued payload', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); f.queue.observe(value()); await Promise.resolve();
    f.queue.observe(value(2)); f.ports.changed.mockImplementation(() => { if (f.queue.view.dropped) f.queue.stop(); }); f.queue.observe(value(3));
    gate.resolve({ state: 'observed' }); await f.queue.flush(); expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.queue.view.pending).toBe(0);
});
it('provider rejection and throwing guards are uncertain delivery, without automatic retry or a navigation exception', async () => {
    const f = fixture(); f.ports.request.mockRejectedValueOnce(new Error('private')); f.queue.observe(value()); await f.queue.flush(); expect(f.queue.view.dropped).toBe(1);
    f.ports.valid.mockImplementation(() => { throw new Error('private'); }); f.queue.observe(value(2)); expect(f.queue.view.dropped).toBe(2); expect(f.ports.request).toHaveBeenCalledOnce();
});
it('replacement of an irrelevant queued source does not invent a loss in the current source', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); f.queue.observe(value()); await Promise.resolve();
    f.queue.observe(value(2)); f.ports.relevant.mockImplementation(item => item.message.sequence !== 2); f.queue.observe(value(3)); expect(f.queue.view.dropped).toBe(0);
    gate.resolve({ state: 'observed' }); await f.queue.flush(); expect(f.ports.request).toHaveBeenCalledTimes(2);
});
it('late calls after disposal cannot queue records, add gaps or publish another notification', async () => {
    const f = fixture(); f.queue.stop(); const count = f.ports.changed.mock.calls.length; f.queue.observe(value()); f.queue.missing(); f.queue.reset(); await f.queue.flush();
    expect(f.ports.request).not.toHaveBeenCalled(); expect(f.ports.changed).toHaveBeenCalledTimes(count); expect(f.queue.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
it('a source retired between observation and submission is disclosed without contacting the provider', async () => {
    const f = fixture(); f.queue.observe(value()); f.ports.valid.mockReturnValue(false); await f.queue.flush();
    expect(f.ports.request).not.toHaveBeenCalled(); expect(f.queue.view).toEqual({ pending: 0, dropped: 1, incomplete: true });
});
it('a throwing subscriber cannot cancel an otherwise valid submission or reject its drain', async () => {
    const f = fixture(); f.ports.changed.mockImplementation(() => { throw new Error('private subscriber'); });
    expect(() => f.queue.observe(value())).not.toThrow(); await expect(f.queue.flush()).resolves.toBeUndefined();
    expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.queue.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
it('disposal from the uncertainty subscriber stops the active drain without publishing after that disposal', async () => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce(null);
    f.ports.changed.mockImplementation(view => { if (view.incomplete) f.queue.stop(); });
    f.queue.observe(value()); await f.queue.flush(); const notifications = f.ports.changed.mock.calls.length;
    f.queue.observe(value(2)); expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.ports.changed).toHaveBeenCalledTimes(notifications);
    expect(f.queue.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
it('disposal during the final native admission check prevents an already scheduled delivery from starting', async () => {
    const f = fixture(); f.queue.observe(value()); f.ports.valid.mockImplementation(() => { f.queue.stop(); return true; });
    await f.queue.flush(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.queue.view.pending).toBe(0);
});
it('disposal reentering initial admission cannot restore an active payload or notify a retired subscriber', async () => {
    const f = fixture(); f.ports.valid.mockImplementation(() => { f.queue.stop(); return true; }); f.queue.observe(value()); await f.queue.flush();
    expect(f.ports.request).not.toHaveBeenCalled(); expect(f.ports.changed).not.toHaveBeenCalled(); expect(f.queue.view.pending).toBe(0);
});
it('disposal reentering replacement assessment cannot restore queued work behind an already active delivery', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); f.queue.observe(value()); await Promise.resolve();
    f.queue.observe(value(2)); const notifications = f.ports.changed.mock.calls.length;
    f.ports.relevant.mockImplementation(() => { f.queue.stop(); return true; }); f.queue.observe(value(3)); gate.resolve({ state: 'observed' }); await f.queue.flush();
    expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.ports.changed).toHaveBeenCalledTimes(notifications); expect(f.queue.view.pending).toBe(0);
});

it('keeps the active drain when an empty-queue callback synchronously observes the next visit', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const release = deferred<unknown>();
    f.ports.request.mockImplementation(async message => {
        if (message.sequence === 1) return { state: 'observed' };
        entered.resolve();
        return release.promise;
    });
    let observed = false;
    f.ports.changed.mockImplementation(view => {
        if (view.pending !== 0 || observed) return;
        observed = true;
        f.queue.observe(value(2));
    });
    f.queue.observe(value());
    const draining = f.queue.flush();
    await entered.promise;
    await Promise.resolve();
    const owner = f.queue.flush();
    release.resolve({ state: 'observed' });
    await Promise.all([draining, owner]);
    expect(f.ports.request.mock.calls.map(([message]) => message.sequence)).toEqual([1, 2]);
    expect(owner).toBe(draining);
    expect(f.queue.view).toEqual({ pending: 0, dropped: 0, incomplete: false });
});
