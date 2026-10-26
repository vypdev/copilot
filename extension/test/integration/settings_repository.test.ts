import { expect, it, vi } from 'vitest';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { memoryStore } from '../fixtures/runtime.ts';

it('github-browser-extension-runtime-C18 serializes concurrent settings writes with optimistic revision and atomic nonsecret rollback', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    expect(await repository.initialize()).toMatchObject({ state: 'ready', settings: DEFAULT_SETTINGS });
    const first = repository.write({ ...DEFAULT_SETTINGS, density: 'compact' }, 0);
    const conflict = repository.write(DEFAULT_SETTINGS, 0);
    expect(await first).toMatchObject({ revision: 1, density: 'compact' }); await expect(conflict).rejects.toThrow('settings-conflict');
    expect(h.values.get(SETTINGS_KEY)).toEqual({ current: { ...DEFAULT_SETTINGS, revision: 1, density: 'compact' }, previous: DEFAULT_SETTINGS });
    expect(await repository.rollback(1)).toMatchObject({ revision: 2, density: 'comfortable' });
    expect(h.port.set).toHaveBeenCalledTimes(2);
});
it('github-browser-extension-runtime-C24 persists validated v0 migration atomically and preserves invalid/future records without rewriting', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port); const legacy = { schemaVersion: 0, compact: true };
    h.values.set(SETTINGS_KEY, legacy); expect(await repository.initialize()).toMatchObject({ state: 'ready', migrated: true, settings: { density: 'compact' } });
    expect(h.values.get(SETTINGS_KEY)).toMatchObject({ previous: legacy });
    for (const invalid of [{ schemaVersion: 99, privateUnknown: 'kept' }, { schemaVersion: 1 }]) {
        h.values.set(SETTINGS_KEY, invalid); const calls = vi.mocked(h.port.set).mock.calls.length;
        expect((await repository.initialize()).state).not.toBe('ready'); await expect(repository.write(DEFAULT_SETTINGS, 0)).rejects.toThrow('settings-conflict');
        expect(h.values.get(SETTINGS_KEY)).toEqual(invalid); expect(h.port.set).toHaveBeenCalledTimes(calls);
    }
});
it('github-browser-extension-runtime-C18 quota failure retains the previous complete envelope and later retry can succeed', async () => {
    const h = memoryStore(); h.values.set(SETTINGS_KEY, { current: DEFAULT_SETTINGS }); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.set).mockRejectedValueOnce(new Error('quota synthetic-secret'));
    await expect(repository.write({ ...DEFAULT_SETTINGS, paused: true }, 0)).rejects.toThrow('quota');
    expect(h.values.get(SETTINGS_KEY)).toEqual({ current: DEFAULT_SETTINGS });
    expect(await repository.write({ ...DEFAULT_SETTINGS, paused: true }, 0)).toMatchObject({ paused: true, revision: 1 });
    await expect(repository.write({ ...DEFAULT_SETTINGS, secret: 'forbidden' }, 1)).rejects.toThrow('settings-conflict');
});
it('github-browser-extension-runtime-C24 rollback rejects absent/invalid recovery and never treats future schema as a rollback', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    await expect(repository.rollback(0)).rejects.toThrow('settings-no-rollback');
    for (const previous of [undefined, { schemaVersion: 9 }, {}]) {
        h.values.set(SETTINGS_KEY, { current: DEFAULT_SETTINGS, previous }); await expect(repository.rollback(0)).rejects.toThrow('settings-no-rollback');
    }
});
