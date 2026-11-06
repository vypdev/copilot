import { expect, it, vi } from 'vitest';
import { temporaryStoreFixture } from '../fixtures/temporary_pause_store.ts';
import { temporaryPauseFixture } from '../fixtures/temporary_pause.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { deferred, PAGE } from '../fixtures/runtime.ts';

function fixture() {
    const writes = temporaryStoreFixture(); const page = temporaryPauseFixture(() => writes.guard.blocked, { values: writes.values, port: writes.port });
    page.cold(); return { writes, page };
}
it('a reserved native mutation blocks cold credential restoration before its asynchronous write settles', async () => {
    const { writes: h, page } = fixture(); const pending = deferred<void>(); const original = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { await pending.promise; await original(key, value); });
    const write = h.store.commit(h.before, h.after, h.current); await vi.waitFor(() => expect(h.port.set).toHaveBeenCalled());
    expect(await page.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
    expect(page.reader.read).not.toHaveBeenCalled(); expect(page.port.get).not.toHaveBeenCalled(); pending.resolve();
    expect(await write).toMatchObject({ state: 'committed' }); expect(h.guard.pending).toBe(false);
});
it('an accepted native no-op never permits a GET after an uncertain pause attempt', async () => {
    const { writes: h, page } = fixture(); vi.mocked(h.port.set).mockResolvedValue(undefined);
    expect(await h.store.commit(h.before, h.after, h.current)).toMatchObject({ state: 'unknown' });
    expect(await page.call(PAGE)).toMatchObject({ state: 'paused' }); expect(page.reader.read).not.toHaveBeenCalled(); expect(page.port.get).not.toHaveBeenCalled();
});
it('only an explicit same-state adoption releases precaution, after which all existing identity verification still runs', async () => {
    const { writes: h, page } = fixture(); vi.mocked(h.port.set).mockRejectedValue(new Error('failed'));
    await h.store.commit(h.before, h.after, h.current); expect(await page.call(PAGE)).toMatchObject({ state: 'paused' });
    expect(await h.store.reconcile(h.before, h.guard.capture(), h.current)).toMatchObject({ state: 'reconciled' });
    expect(await page.call()).toMatchObject({ state: 'ready', connected: true, settings: { paused: false } }); expect(page.reader.read).toHaveBeenCalledTimes(2);
});
it('adopting a known state cannot grant a repository connection that was not already configured', async () => {
    const { writes: h, page } = fixture(); h.guard.settle(h.guard.hold()!, true); page.local.values.set(SETTINGS_KEY, DEFAULT_SETTINGS);
    await h.store.reconcile(h.before, h.guard.capture(), h.current);
    expect(await page.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: false } }); expect(page.reader.read).not.toHaveBeenCalled();
});
it('adoption never releases a confirmed native emergency pause', async () => {
    const { writes: h, page } = fixture(); h.values.set(TEMPORARY_PAUSES_KEY, h.after); h.guard.settle(h.guard.hold()!, true);
    await h.store.reconcile(h.after, h.guard.capture(), h.current); expect(h.guard.blocked).toBe(false);
    expect(await page.call(PAGE)).toMatchObject({ state: 'paused' }); expect(page.reader.read).not.toHaveBeenCalled();
});
it('even a later confirmed resumption cannot implicitly clear an earlier uncertain-operation precaution', async () => {
    const { writes: h, page } = fixture(); h.guard.settle(h.guard.hold()!, true); h.values.set(TEMPORARY_PAUSES_KEY, h.after);
    expect(await h.store.commit(h.after, { ...h.after, revision: 2, emergency: false }, h.current)).toMatchObject({ state: 'committed' });
    expect(await page.call(PAGE)).toMatchObject({ state: 'paused' }); expect(page.reader.read).not.toHaveBeenCalled();
});
it('deleting a native key in the same worker cannot turn its unresolved precaution into an empty resume grant', async () => {
    const { writes: h, page } = fixture(); h.guard.settle(h.guard.hold()!, true); h.values.delete(TEMPORARY_PAUSES_KEY);
    expect(await page.call(PAGE)).toMatchObject({ state: 'paused' }); expect(page.reader.read).not.toHaveBeenCalled(); expect(h.guard.uncertain).toBe(true);
});
