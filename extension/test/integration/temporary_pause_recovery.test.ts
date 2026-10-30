import { expect, it, vi } from 'vitest';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { temporaryStoreFixture as fixture } from '../fixtures/temporary_pause_store.ts';
import { deferred } from '../fixtures/runtime.ts';

function uncertain(h: ReturnType<typeof fixture>): object { h.guard.settle(h.guard.hold()!, true); return h.guard.capture(); }
it('adopts only an explicitly reviewed same native state without rewriting or certifying an older attempt', async () => {
    const h = fixture(); const witness = uncertain(h);
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'reconciled', revision: 0, current: true });
    expect(h.guard.blocked).toBe(false); expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled();
    expect((await h.store.inspect()).loaded).toEqual({ state: 'ready', value: h.before });
});
it('a current read alone never clears precaution or turns a missing acknowledgement into a completed operation', async () => {
    const h = fixture(); uncertain(h); expect(await h.store.inspect()).toMatchObject({ precaution: true, pending: false });
    expect(h.guard.uncertain).toBe(true); expect(await h.reader.read()).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('adoption retains every native emergency and tab pause', async () => {
    const h = fixture(); const value = { ...h.before, emergency: true, tabs: [9, 3] }; h.values.set(TEMPORARY_PAUSES_KEY, value);
    const witness = uncertain(h); expect(await h.store.reconcile(value, witness, h.current)).toMatchObject({ state: 'reconciled' });
    expect(await h.reader.read()).toMatchObject({ state: 'ready', value: { emergency: true, tabs: [3, 9] } }); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(value);
});
it('invalid source data cannot be used for a recovery', async () => {
    const h = fixture(); const witness = uncertain(h); expect(await h.store.reconcile(null, witness, h.current)).toEqual({ state: 'invalid' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.guard.uncertain).toBe(true);
});
it.each(['future', 'corrupt', 'unavailable'] as const)('a %s native observation stays preserved and cannot be adopted as empty', async state => {
    const h = fixture(); const witness = uncertain(h);
    if (state === 'unavailable') vi.mocked(h.port.get).mockRejectedValue(new Error('native-unavailable'));
    else h.values.set(TEMPORARY_PAUSES_KEY, state === 'future' ? { schemaVersion: 9 } : null);
    const original = h.values.get(TEMPORARY_PAUSES_KEY); expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state });
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(original); expect(h.guard.uncertain).toBe(true); expect(h.port.set).not.toHaveBeenCalled();
});
it('a changed native state invalidates recovery even if its revision was reused', async () => {
    const h = fixture(); const witness = uncertain(h); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, tabs: [9] });
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'conflict' }); expect(h.guard.uncertain).toBe(true);
});
it('a newer precaution cannot be cleared by an older private witness', async () => {
    const h = fixture(); const old = uncertain(h); uncertain(h);
    expect(await h.store.reconcile(h.before, old, h.current)).toEqual({ state: 'conflict' }); expect(h.guard.uncertain).toBe(true);
});
it('an in-flight mutation prevents adoption even when the witness itself is current', async () => {
    const h = fixture(); uncertain(h); h.guard.hold(); const witness = h.guard.capture();
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'conflict' }); expect(h.guard.blocked).toBe(true);
});
it('a fresh recovery with no precaution is unchanged; an older adoption cannot replay against a new witness', async () => {
    const h = fixture(); const old = uncertain(h); await h.store.reconcile(h.before, old, h.current);
    expect(await h.store.reconcile(h.before, old, h.current)).toEqual({ state: 'conflict' });
    expect(await h.store.reconcile(h.before, h.guard.capture(), h.current)).toEqual({ state: 'unchanged' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a stale caller cannot begin recovery', async () => {
    const h = fixture(); const witness = uncertain(h); h.retire();
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.guard.uncertain).toBe(true);
});
it('a recovery retired in the same turn before its queued start does not inspect native state', async () => {
    const h = fixture(); const witness = uncertain(h); const request = h.store.reconcile(h.before, witness, h.current); h.retire();
    expect(await request).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.guard.uncertain).toBe(true);
});
it('source loss during native recovery inspection preserves the precaution', async () => {
    const h = fixture(); const witness = uncertain(h); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const request = h.store.reconcile(h.before, witness, h.current); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled());
    h.retire(); pending.resolve(h.before); expect(await request).toEqual({ state: 'stale' }); expect(h.guard.uncertain).toBe(true);
});
it('the final recovery source check cannot be bypassed by the preceding successful observation', async () => {
    const h = fixture(); const witness = uncertain(h); h.current.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'stale' }); expect(h.guard.uncertain).toBe(true);
});
it('a synchronous reservation during the final source callback cannot clear another active mutation', async () => {
    const h = fixture(); const witness = uncertain(h);
    h.current.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true).mockImplementationOnce(() => { h.guard.hold(); return true; });
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'conflict' }); expect(h.guard.uncertain).toBe(true);
});
it('source loss from a recovery notification changes publication authority, without erasing the adoption fact', async () => {
    const h = fixture(); const witness = uncertain(h); h.ports.changed.mockImplementation(h.retire);
    expect(await h.store.reconcile(h.before, witness, h.current)).toEqual({ state: 'reconciled', revision: 0, current: false }); expect(h.guard.uncertain).toBe(false);
});
