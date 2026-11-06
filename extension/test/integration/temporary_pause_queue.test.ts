import { expect, it, vi } from 'vitest';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { temporaryStoreFixture as fixture } from '../fixtures/temporary_pause_store.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { TemporaryPauseOutcome } from '../../src/domain/temporary_pause_result.ts';

it('serializes distinct reviewed revisions without exposing an unpaused gap between writes', async () => {
    const h = fixture(); const second = { ...h.after, revision: 2, tabs: [7] };
    const first = h.store.commit(h.before, h.after, h.current); const next = h.store.commit(h.after, second, h.current);
    expect(h.guard.blocked).toBe(true); expect(await first).toMatchObject({ state: 'committed', revision: 1 }); expect(h.guard.pending).toBe(true);
    expect(await next).toMatchObject({ state: 'committed', revision: 2 }); expect(h.guard.pending).toBe(false);
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(second); expect(h.port.set).toHaveBeenCalledTimes(2);
});
it('bounds the queue and never lets a conflicting old preview overwrite the first completed effect', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const operations = Array.from({ length: 16 }, () => h.store.commit(h.before, h.after, h.current));
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'busy' }); pending.resolve(h.before);
    const results = await Promise.all(operations); expect(results.filter(value => value.state === 'committed')).toHaveLength(1);
    expect(results.filter(value => value.state === 'conflict')).toHaveLength(15); expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.guard.blocked).toBe(false);
});
it('refuses a guard already at capacity without inspecting or writing native state', async () => {
    const h = fixture(); for (let i = 0; i < 16; i++) h.guard.hold();
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'busy' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('FIFO ownership is reserved before a secondary notification can synchronously submit another change', async () => {
    const h = fixture(); const second = { ...h.after, revision: 2, tabs: [9] }; let reentered: Promise<TemporaryPauseOutcome> | undefined;
    h.ports.changed.mockImplementationOnce(() => { reentered = h.store.commit(h.after, second, h.current); });
    expect(await h.store.commit(h.before, h.after, h.current)).toMatchObject({ state: 'committed', revision: 1 });
    expect(await reentered).toMatchObject({ state: 'committed', revision: 2 }); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(second);
});
it('a failed source before write releases its own hold without poisoning the following reviewed operation', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise); let source = true;
    const first = h.store.commit(h.before, h.after, () => source); const next = h.store.commit(h.before, h.after, h.current);
    await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); source = false; pending.resolve(h.before);
    expect(await first).toEqual({ state: 'stale' }); expect(await next).toMatchObject({ state: 'committed' }); expect(h.guard.uncertain).toBe(false);
});
it('bounded concurrent adoptions never reinterpret the first adopted state as approval for another witness', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true); const witness = h.guard.capture(); const pending = deferred<unknown>();
    vi.mocked(h.port.get).mockReturnValueOnce(pending.promise); const operations = Array.from({ length: 16 }, () => h.store.reconcile(h.before, witness, h.current));
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'busy' }); pending.resolve(h.before);
    const results = await Promise.all(operations); expect(results.filter(value => value.state === 'reconciled')).toHaveLength(1);
    expect(results.filter(value => value.state === 'conflict')).toHaveLength(15); expect(h.port.set).not.toHaveBeenCalled(); expect(h.guard.blocked).toBe(false);
});
it('notification-time source withdrawal is checked before any native inspection', async () => {
    const h = fixture(); h.ports.changed.mockImplementationOnce(h.retire);
    expect(await h.store.commit(h.before, h.after, h.current)).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
