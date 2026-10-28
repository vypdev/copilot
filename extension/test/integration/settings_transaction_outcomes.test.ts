import { expect, it, vi } from 'vitest';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { deferred, memoryStore } from '../fixtures/runtime.ts';

const ID = 'a'.repeat(32); const secondId = 'b'.repeat(32);
const desired = { ...DEFAULT_SETTINGS, density: 'compact' as const };

it('captures the admitted candidate before a caller can change it while the transaction is queued', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    const input = { ...DEFAULT_SETTINGS, density: 'compact' as 'compact' | 'comfortable' };
    const pending = repository.commit(input, 0, ID, () => true);
    input.density = 'comfortable';
    expect(await pending).toMatchObject({ state: 'committed' });
    expect((await repository.read()).settings.density).toBe('compact');
    expect(input.density).toBe('comfortable');
});

it('bexh3-center-C16 observes an atomic commit after its acknowledgement fails and never retries the write', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => {
        h.values.set(key, structuredClone(value)); throw new Error('synthetic_secret');
    });
    expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'committed', revision: 1, acknowledgement: 'unknown', current: true });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('an acknowledgement alone cannot prove that a complete record was persisted', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.set).mockResolvedValueOnce(undefined);
    expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'unknown', acknowledgement: 'accepted', observedRevision: 0, observation: 'unchanged' });
    expect(h.values.has(SETTINGS_KEY)).toBe(false); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('partial persistence without the exact receipt never masquerades as observed operation success', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.set).mockImplementationOnce(async () => { h.values.set(SETTINGS_KEY, { current: { ...desired, revision: 1 } }); });
    expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'unknown', acknowledgement: 'accepted', observedRevision: 1, observation: 'changed' });
});
it('quota-like rejection preserves the observed original state and does not fabricate a never-applied guarantee', async () => {
    const h = memoryStore(); const original = { current: DEFAULT_SETTINGS };
    h.values.set(SETTINGS_KEY, original); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.set).mockRejectedValueOnce(new Error('quota synthetic_secret'));
    expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'unknown', acknowledgement: 'unknown', observedRevision: 0, observation: 'unchanged' });
    expect(h.values.get(SETTINGS_KEY)).toEqual(original); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('future or unavailable readback retains acknowledgement and observation as distinct facts', async () => {
    for (const rejected of [false, true]) {
        const h = memoryStore(); const repository = new SettingsRepository(h.port);
        vi.mocked(h.port.set).mockImplementationOnce(async () => { h.values.set(SETTINGS_KEY, { schemaVersion: 99 });
            if (rejected) throw new Error('private internal text'); });
        expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'unknown', acknowledgement: rejected ? 'unknown' : 'accepted',
            observedRevision: null, observation: 'unavailable' });
    }
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.get).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('secret readback error'));
    expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'unknown', acknowledgement: 'accepted', observedRevision: null, observation: 'unavailable' });
});
it('a matching ID with a wrong before revision or changed content remains unknown, even after acknowledgement', async () => {
    for (const changed of [{ operation: { id: ID, beforeRevision: 5 } }, { current: { ...desired, revision: 1, paused: true } }]) {
        const h = memoryStore(); const repository = new SettingsRepository(h.port);
        vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => { h.values.set(key, { ...value as object, ...changed }); });
        expect(await repository.commit(desired, 0, ID, () => true)).toMatchObject({ state: 'unknown', observation: 'changed' });
    }
});
it('authority changes during the initial read stop before write; changes after persistence preserve completed facts', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port); let epoch = 0;
    const read = deferred<unknown>(); vi.mocked(h.port.get).mockImplementationOnce(() => read.promise);
    const pending = repository.commit(desired, 0, ID, () => epoch === 0);
    await Promise.resolve(); expect(h.port.get).toHaveBeenCalledTimes(1);
    epoch++; read.resolve(undefined); expect(await pending).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
    const set = deferred<void>(); const started = deferred<void>();
    vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => {
        h.values.set(key, structuredClone(value)); started.resolve(); await set.promise;
    });
    const after = repository.commit(desired, 0, ID, () => epoch === 1);
    await started.promise;
    epoch++; set.resolve(); expect(await after).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: false });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('two competing previews serialize against the latest complete revision and only one can commit', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    const first = repository.commit(desired, 0, ID, () => true);
    const second = repository.commit({ ...DEFAULT_SETTINGS, paused: true }, 0, secondId, () => true);
    expect(await first).toMatchObject({ state: 'committed', revision: 1 }); expect(await second).toEqual({ state: 'conflict' });
    expect(h.port.set).toHaveBeenCalledTimes(1);
    await repository.update(settings => ({ ...settings, locale: 'es' }));
    expect((await repository.read()).settings).toMatchObject({ revision: 2, density: 'compact', locale: 'es' });
    expect(await repository.commit(desired, 0, ID, () => true)).toEqual({ state: 'conflict' });
});
