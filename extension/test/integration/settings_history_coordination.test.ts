import { expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/domain/settings.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { journalReviewsFixture, clearPreview, JOURNAL_OWNER } from '../fixtures/journal_reviews.ts';
import { deferred, memoryStore } from '../fixtures/runtime.ts';

const id = 'f'.repeat(32);
it('serializes actual startup migration, reviewed commit and application update behind a reservation', async () => {
    const memory = memoryStore(); const repository = new SettingsRepository(memory.port);
    memory.values.set(SETTINGS_KEY, { schemaVersion: 0, compact: true }); const held = repository.reserveMutations()!;
    const initial = repository.initialize(); const candidate = loadSettings({ schemaVersion: 0, compact: true }).settings;
    const commit = repository.commit(candidate, 0, id, () => true); const update = repository.update(s => ({ ...s, paused: true }));
    await Promise.resolve(); await Promise.resolve(); expect(memory.port.set).not.toHaveBeenCalled();
    expect((await repository.read()).state).toBe('ready'); held.release();
    await initial; expect((await commit).state).toBe('committed'); expect((await update).revision).toBe(2);
    expect((await repository.read()).settings).toMatchObject({ revision: 2, density: 'compact', paused: true }); expect(memory.port.set).toHaveBeenCalledTimes(3);
});
it('a source retired while a commit waits cannot apply when the reservation is released', async () => {
    const memory = memoryStore(); const repository = new SettingsRepository(memory.port); const held = repository.reserveMutations()!; let current = true;
    const result = repository.commit({ ...DEFAULT_SETTINGS, theme: 'dark' }, 0, id, () => current); current = false; held.release();
    expect(await result).toEqual({ state: 'stale' }); expect(memory.port.set).not.toHaveBeenCalled();
});
it('preserves the admission-time settings snapshot while a mutation is waiting', async () => {
    const memory = memoryStore(); const repository = new SettingsRepository(memory.port); const held = repository.reserveMutations()!;
    const candidate = structuredClone(DEFAULT_SETTINGS); const result = repository.commit(candidate, 0, id, () => true);
    Object.assign(candidate, { theme: 'dark' }); held.release(); expect((await result).state).toBe('committed');
    expect((await repository.read()).settings.theme).toBe(DEFAULT_SETTINGS.theme);
});
it('an uncertain settings acknowledgement still releases queue ownership and preserves its unknown facts', async () => {
    const memory = memoryStore(); const repository = new SettingsRepository(memory.port); vi.mocked(memory.port.set).mockRejectedValueOnce(new Error('native'));
    const result = await repository.commit({ ...DEFAULT_SETTINGS, theme: 'dark' }, 0, id, () => true);
    expect(result).toMatchObject({ state: 'unknown', acknowledgement: 'unknown', observation: 'unchanged' });
    const available = repository.reserveMutations()!; expect(available.current()).toBe(true); available.release();
    expect((await repository.update(s => ({ ...s, theme: 'dark' }))).theme).toBe('dark');
});
it('an executing settings write prevents a clear reservation before any native history effect', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const gate = deferred<void>(); vi.mocked(f.port.set).mockImplementationOnce(() => gate.promise);
    const changing = f.settings.update(s => ({ ...s, theme: 'dark' }));
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'busy' });
    expect(f.ports.reserve).not.toHaveBeenCalled(); expect(f.store.execute.mock.calls).toHaveLength(1); gate.resolve(); await changing;
});
it('holds subsequent preference writes until the actual clear and its canonical observation finish', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const gate = deferred<void>(); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementationOnce(async (...args) => { await gate.promise; return execute(...args); });
    const clearing = f.reviews.confirm(preview.operationId, JOURNAL_OWNER); const changing = f.settings.update(s => ({ ...s, theme: 'dark' }));
    await Promise.resolve(); await Promise.resolve(); expect(f.port.set).not.toHaveBeenCalled(); gate.resolve();
    expect((await clearing).state).toBe('observed-cleared'); expect((await changing).theme).toBe('dark'); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
it('a failed collection reservation releases the preference reservation so later mutations can continue', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); f.ports.reserve.mockReturnValueOnce(null as never);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'busy' });
    expect((await f.settings.update(s => ({ ...s, theme: 'dark' }))).revision).toBe(1);
});
it('preference reservation cleanup cannot erase an already observed clear fact', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const reserve = f.settings.reserveMutations.bind(f.settings);
    vi.spyOn(f.settings, 'reserveMutations').mockImplementationOnce(() => {
        const held = reserve()!; return { current: held.current, release() { held.release(); throw new Error('cleanup'); } };
    });
    expect((await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).state).toBe('observed-cleared');
    expect((await f.settings.update(s => ({ ...s, theme: 'dark' }))).revision).toBe(1);
});
it('a preference reservation retired during canonical privacy read cannot admit a history write', async () => {
    const f = journalReviewsFixture(); const preview = await clearPreview(f); const gate = deferred<unknown>();
    const reserve = f.settings.reserveMutations.bind(f.settings); let acquired: ReturnType<typeof reserve> = null;
    vi.spyOn(f.settings, 'reserveMutations').mockImplementationOnce(() => { acquired = reserve(); return acquired; });
    f.get.mockImplementationOnce(() => gate.promise); const result = f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(acquired).not.toBeNull(); (acquired! as NonNullable<ReturnType<typeof reserve>>).release(); gate.resolve(undefined);
    expect(await result).toEqual({ state: 'stale' }); expect(f.store.execute.mock.calls).toHaveLength(1); expect(f.lease.release).toHaveBeenCalledTimes(1);
});
