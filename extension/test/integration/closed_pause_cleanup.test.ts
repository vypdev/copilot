import { expect, it, vi } from 'vitest';
import { ClosedPauseCleanup } from '../../src/application/closed_pause_cleanup.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { temporaryStoreFixture } from '../fixtures/temporary_pause_store.ts';
import { deferred } from '../fixtures/runtime.ts';

function fixture(tabs = [7, 9]) {
    const h = temporaryStoreFixture(); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, tabs });
    return { ...h, cleanup: new ClosedPauseCleanup(h.store) };
}
it('coalesces native closure facts, deduplicates IDs and preserves unrelated scopes in one write', async () => {
    const h = fixture([7, 9, 11]); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, tabs: [7, 9, 11], emergency: true });
    h.cleanup.close(7); h.cleanup.close(9); h.cleanup.close(7); h.cleanup.close(42); await h.cleanup.idle();
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ ...h.before, revision: 1, emergency: true, tabs: [11] }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('unrelated and malformed IDs never rewrite the record or change a guard witness', async () => {
    const h = fixture(); const witness = h.guard.capture(); h.cleanup.close(-1); await h.cleanup.idle(); expect(h.port.get).not.toHaveBeenCalled();
    h.cleanup.close(99); await h.cleanup.idle(); expect(h.port.set).not.toHaveBeenCalled(); expect(h.guard.capture()).toBe(witness);
});
it('bounds a queued native batch at128 facts, preserving any unprocessed nonactive record rather than guessing', async () => {
    const h = fixture([0, 127, 129]); for (let id = 0; id < 130; id++) h.cleanup.close(id); await h.cleanup.idle();
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ ...h.before, revision: 1, tabs: [129] }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a new closure arriving during inspection is processed as fresh work after the current batch, not a retry', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    h.cleanup.close(7); const idle = h.cleanup.idle(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.cleanup.close(9);
    pending.resolve({ ...h.before, tabs: [7, 9] }); await idle;
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ ...h.before, revision: 2, tabs: [] }); expect(h.port.set).toHaveBeenCalledTimes(2);
});
it('a source retired before scheduled work performs no native inspection and cannot be restarted by another event', async () => {
    const h = fixture(); h.cleanup.close(7); const idle = h.cleanup.idle(); h.cleanup.stop(); h.cleanup.close(9); await idle;
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled(); await h.cleanup.idle();
});
it('source retirement during native inspection preserves data without making a write', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    h.cleanup.close(7); const idle = h.cleanup.idle(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.cleanup.stop(); pending.resolve({ ...h.before, tabs: [7, 9] }); await idle;
    expect(h.port.set).not.toHaveBeenCalled(); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ ...h.before, tabs: [7, 9] });
});
it('retirement never pretends that an already attempted native effect has stopped', async () => {
    const h = fixture(); const pending = deferred<void>(); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await pending.promise; await original(key, value); });
    h.cleanup.close(7); let settled = false; const idle = h.cleanup.idle().then(() => { settled = true; });
    await vi.waitFor(() => expect(h.port.set).toHaveBeenCalled()); h.cleanup.stop(); await Promise.resolve();
    expect(settled).toBe(false); expect(h.guard.pending).toBe(true); pending.resolve(); await idle;
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ ...h.before, revision: 1, tabs: [9] }); expect(h.guard.uncertain).toBe(true);
});
it.each(['future', 'corrupt', 'unavailable', 'pending'] as const)('preserves %s native state and never initializes or retries cleanup', async state => {
    const h = fixture();
    if (state === 'future') h.values.set(TEMPORARY_PAUSES_KEY, { schemaVersion: 99 });
    if (state === 'corrupt') h.values.set(TEMPORARY_PAUSES_KEY, null);
    if (state === 'unavailable') vi.mocked(h.port.get).mockRejectedValue(new Error('native unavailable'));
    if (state === 'pending') h.guard.hold();
    const original = h.values.get(TEMPORARY_PAUSES_KEY); h.cleanup.close(7); await h.cleanup.idle();
    expect(h.port.set).not.toHaveBeenCalled(); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual(original);
});
it('an unknown native cleanup retains a precaution and does not repeat its attempted mutation', async () => {
    const h = fixture(); vi.mocked(h.port.set).mockResolvedValue(undefined); h.cleanup.close(7); await h.cleanup.idle(); await h.cleanup.idle();
    expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.guard.uncertain).toBe(true); expect(h.values.get(TEMPORARY_PAUSES_KEY)).toEqual({ ...h.before, tabs: [7, 9] });
});
it('successful closure cleanup cannot silently release an older precaution', async () => {
    const h = fixture(); h.guard.settle(h.guard.hold()!, true); h.cleanup.close(7); await h.cleanup.idle();
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ tabs: [9] }); expect(h.guard.uncertain).toBe(true);
});
it('an exhausted revision is preserved without a write or implicit rollover', async () => {
    const h = fixture(); h.values.set(TEMPORARY_PAUSES_KEY, { ...h.before, revision: Number.MAX_SAFE_INTEGER, tabs: [7] }); h.cleanup.close(7); await h.cleanup.idle();
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ revision: Number.MAX_SAFE_INTEGER, tabs: [7] }); expect(h.port.set).not.toHaveBeenCalled();
});
it('an unexpected inspection boundary failure is contained and does not poison a later new native event', async () => {
    const h = fixture(); const inspect = h.store.inspect.bind(h.store); vi.spyOn(h.store, 'inspect').mockRejectedValueOnce(new Error('boundary failed')).mockImplementation(inspect);
    h.cleanup.close(7); await h.cleanup.idle(); expect(h.port.set).not.toHaveBeenCalled(); h.cleanup.close(9); await h.cleanup.idle();
    expect(h.values.get(TEMPORARY_PAUSES_KEY)).toMatchObject({ tabs: [7] }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
