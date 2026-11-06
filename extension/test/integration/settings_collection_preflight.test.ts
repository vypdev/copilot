import { expect, it, vi } from 'vitest';
import { SETTINGS_KEY, SettingsRepository } from '../../src/application/settings_repository.ts';
import { settingsWriteScope, type SettingsWriteEffects } from '../../src/application/settings_write_effects.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { deferred, memoryStore } from '../fixtures/runtime.ts';

const ID = 'a'.repeat(32);
it('preserves existing settings saves when no collection effect owner is installed', async () => {
    const memory = memoryStore(); const repository = new SettingsRepository(memory.port);
    expect((await repository.commit(collectionSettings(true), 0, ID, () => true)).state).toBe('committed');
    expect((await repository.read()).settings.center.diagnostics).toBe(true);
});
function prepared(allowed = true) {
    const release = vi.fn(); const effects: SettingsWriteEffects = { prepare: vi.fn(async () => ({ allowed, release })) };
    const memory = memoryStore(); const repository = new SettingsRepository(memory.port, effects);
    return { ...memory, release, effects, repository };
}
it('does not publish a reviewed preference before its restriction preparation completes', async () => {
    const f = prepared(); const gate = deferred<{ allowed: boolean; release(): void }>(); vi.mocked(f.effects.prepare).mockReturnValueOnce(gate.promise);
    const result = f.repository.commit(collectionSettings(true), 0, ID, () => true);
    await vi.waitFor(() => expect(f.effects.prepare).toHaveBeenCalledTimes(1)); expect(f.port.set).not.toHaveBeenCalled();
    gate.resolve({ allowed: true, release: f.release }); expect((await result).state).toBe('committed'); expect(f.release).toHaveBeenCalledTimes(1);
});
it.each(['diagnostics', 'recents'] as const)('refuses a %s opt-in after secondary preparation throws', async kind => {
    const f = prepared(); vi.mocked(f.effects.prepare).mockRejectedValueOnce(new Error('unavailable'));
    expect(await f.repository.commit({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, [kind]: true } }, 0, ID, () => true)).toEqual({ state: 'unavailable' });
    expect(f.port.set).not.toHaveBeenCalled();
});
it('still saves a restrictive off preference when secondary preparation throws', async () => {
    const f = prepared(); f.values.set(SETTINGS_KEY, collectionSettings(true)); vi.mocked(f.effects.prepare).mockRejectedValueOnce(new Error('native'));
    expect((await f.repository.commit(DEFAULT_SETTINGS, 0, ID, () => true)).state).toBe('committed');
    expect((await f.repository.read()).settings.center.diagnostics).toBe(false);
});
it('does not block an unrelated application save when secondary preparation throws', async () => {
    const f = prepared(); vi.mocked(f.effects.prepare).mockRejectedValueOnce(new Error('native'));
    expect((await f.repository.update(s => ({ ...s, theme: 'dark' }))).theme).toBe('dark');
});
it('rechecks the reviewed source after preparation without erasing a completed restriction', async () => {
    const f = prepared(); let current = true;
    vi.mocked(f.effects.prepare).mockImplementationOnce(async (_before, _after, guard) => {
        expect(guard()).toBe(true); current = false; return { allowed: false, release: f.release };
    });
    expect(await f.repository.commit(collectionSettings(true), 0, ID, () => current)).toEqual({ state: 'stale' });
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
});
it('rejects an application opt-in when preparation refuses it and releases the queue', async () => {
    const f = prepared(false);
    await expect(f.repository.update(() => collectionSettings(true))).rejects.toThrow('settings-collection-unavailable');
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.repository.reserveMutations()).not.toBeNull();
});
it('rechecks an application source retired during preparation', async () => {
    const f = prepared(); let current = true;
    vi.mocked(f.effects.prepare).mockImplementationOnce(async () => { current = false; return { allowed: true, release: f.release }; });
    await expect(f.repository.update(s => ({ ...s, theme: 'dark' }), () => current)).rejects.toThrow('settings-conflict-or-invalid');
    expect(f.port.set).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
});
it('preparation receives detached immutable admitted settings even when the caller changes nested fields while waiting', async () => {
    const f = prepared(); const gate = deferred<{ allowed: boolean; release(): void }>();
    const candidate = structuredClone(collectionSettings(true)); vi.mocked(f.effects.prepare).mockReturnValueOnce(gate.promise);
    const result = f.repository.update(() => candidate); await vi.waitFor(() => expect(f.effects.prepare).toHaveBeenCalled());
    Object.assign(candidate.center.appearance, { text: 'large' }); Object.assign(candidate.center, { diagnostics: false });
    gate.resolve({ allowed: true, release: f.release }); const stored = await result;
    expect(stored.center).toMatchObject({ diagnostics: true, appearance: { text: 'standard' } }); expect(Object.isFrozen(stored.center)).toBe(true);
});
it('does not repeat restriction effects when an already committed operation replays', async () => {
    const f = prepared(); expect((await f.repository.commit(collectionSettings(true), 0, ID, () => true)).state).toBe('committed');
    expect((await f.repository.commit(collectionSettings(true), 0, ID, () => true)).state).toBe('replayed'); expect(f.effects.prepare).toHaveBeenCalledTimes(1);
});
it('does not prepare invalid or revision-conflicting plans', async () => {
    const f = prepared(); expect((await f.repository.commit({}, 0, ID, () => true)).state).toBe('invalid');
    expect((await f.repository.commit(DEFAULT_SETTINGS, 1, ID, () => true)).state).toBe('conflict'); expect(f.effects.prepare).not.toHaveBeenCalled();
});
it('keeps a saved primary fact when release throws and never repeats release', async () => {
    const f = prepared(); f.release.mockImplementation(() => { throw new Error('cleanup'); });
    expect((await f.repository.commit(DEFAULT_SETTINGS, 0, ID, () => true)).state).toBe('committed');
    const scope = await settingsWriteScope(f.effects, DEFAULT_SETTINGS, DEFAULT_SETTINGS, () => true); scope.release(); scope.release();
    expect(f.release).toHaveBeenCalledTimes(2);
});
it('releases after a lost primary acknowledgement while retaining uncertainty', async () => {
    const f = prepared(); vi.mocked(f.port.set).mockRejectedValueOnce(new Error('native'));
    expect(await f.repository.commit(DEFAULT_SETTINGS, 0, ID, () => true)).toMatchObject({ state: 'unknown', acknowledgement: 'unknown' });
    expect(f.release).toHaveBeenCalledTimes(1);
});
it('releases after an application storage failure and permits the next queued mutation', async () => {
    const f = prepared(); vi.mocked(f.port.set).mockRejectedValueOnce(new Error('native'));
    await expect(f.repository.update(s => ({ ...s, theme: 'dark' }))).rejects.toThrow('native');
    expect((await f.repository.update(s => ({ ...s, theme: 'light' }))).theme).toBe('light'); expect(f.release).toHaveBeenCalledTimes(2);
});
it('preserves startup migrations without granting collection or invoking preference preflight', async () => {
    const f = prepared(); f.values.set(SETTINGS_KEY, { schemaVersion: 0, compact: true });
    expect((await f.repository.initialize()).settings.center.diagnostics).toBe(false); expect(f.effects.prepare).not.toHaveBeenCalled();
});
