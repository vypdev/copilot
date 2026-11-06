import { expect, it, vi } from 'vitest';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { memoryStore } from '../fixtures/runtime.ts';

const ID = 'a'.repeat(32); const current = () => true;
const desired = { ...DEFAULT_SETTINGS, density: 'compact' as const };

it('bexh3-center-C14 commits a complete revision, rollback and operation receipt once; replay performs no second write', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port); const input = structuredClone(desired);
    expect(await repository.commit(input, 0, ID, current)).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: true });
    expect(h.values.get(SETTINGS_KEY)).toEqual({ current: { ...desired, revision: 1 }, previous: DEFAULT_SETTINGS,
        operation: { id: ID, beforeRevision: 0 } });
    const written = vi.mocked(h.port.set).mock.calls[0][1] as { current: unknown };
    expect(Object.isFrozen(written.current)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(await repository.commit(input, 0, ID, current)).toEqual({ state: 'replayed', revision: 1 });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a reused operation ID cannot acknowledge a different body or revision', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    await repository.commit(desired, 0, ID, current);
    expect(await repository.commit(DEFAULT_SETTINGS, 0, ID, current)).toEqual({ state: 'invalid' });
    expect(await repository.commit(desired, 1, ID, current)).toEqual({ state: 'invalid' });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a cold or restarted observer can inspect exact current/rollback/operation facts without changing storage', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    expect(await repository.inspect()).toEqual({ loaded: { state: 'ready', settings: DEFAULT_SETTINGS, migrated: false }, rollback: null, operation: null });
    h.values.set(SETTINGS_KEY, desired);
    expect(await repository.inspect()).toMatchObject({ loaded: { state: 'ready', settings: desired }, rollback: null, operation: null });
    await repository.commit(desired, 0, ID, current);
    const restored = new SettingsRepository(h.port);
    expect(await restored.inspect()).toMatchObject({ loaded: { settings: { revision: 1 } }, rollback: desired, operation: { id: ID, beforeRevision: 0 } });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('forged, stale or malformed stored receipts cannot establish idempotent completion', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    for (const operation of [undefined, null, [], {}, { id: 1, beforeRevision: 0 }, { id: ID, beforeRevision: -1 },
        { id: ID, beforeRevision: 8 }, { id: ID, beforeRevision: 0, extra: true }]) {
        h.values.set(SETTINGS_KEY, { current: { ...desired, revision: 1 }, previous: { schemaVersion: 99 }, operation });
        expect(await repository.inspect()).toMatchObject({ operation: null, rollback: null });
    }
    h.values.set(SETTINGS_KEY, { current: { ...desired, schemaVersion: 99 }, operation: { id: ID, beforeRevision: 0 } });
    expect(await repository.inspect()).toMatchObject({ loaded: { state: 'future' }, operation: null });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('unknown envelope metadata and future raw records remain untouched instead of being normalized through current', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    for (const raw of [{ current: DEFAULT_SETTINGS, unknownEnvelope: true }, { schemaVersion: 99, current: DEFAULT_SETTINGS }]) {
        h.values.set(SETTINGS_KEY, raw);
        expect((await repository.initialize()).state).not.toBe('ready');
        expect(await repository.commit(desired, 0, ID, current)).toEqual({ state: 'invalid' });
        expect(h.values.get(SETTINGS_KEY)).toEqual(raw);
    }
    expect(h.port.set).not.toHaveBeenCalled();
});
it('invalid inputs, exhausted revision and uncommitted migration fail before storage mutation', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    for (const [value, revision, id] of [[{}, 0, ID], [desired, -1, ID], [desired, 0, 'invalid'],
        [desired, Number.MAX_SAFE_INTEGER, ID]] as const) {
        expect(await repository.commit(value, revision, id, current)).toEqual({ state: 'invalid' });
    }
    const { center: _center, ...legacy } = DEFAULT_SETTINGS;
    h.values.set(SETTINGS_KEY, { ...legacy, schemaVersion: 1 });
    expect(await repository.commit(desired, 0, ID, current)).toEqual({ state: 'invalid' });
    h.values.set(SETTINGS_KEY, { schemaVersion: 99 });
    expect(await repository.commit(desired, 0, ID, current)).toEqual({ state: 'invalid' });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('a stale revision or missing current authority cannot initiate a save', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    h.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 2 });
    expect(await repository.commit(desired, 0, ID, current)).toEqual({ state: 'conflict' });
    expect(await repository.commit(desired, 2, ID, () => false)).toEqual({ state: 'stale' });
    expect(await repository.commit(desired, 2, ID, () => { throw new Error('private provider message'); })).toEqual({ state: 'stale' });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('a failed initial storage read is unavailable and does not poison the serialized mutation queue', async () => {
    const h = memoryStore(); const repository = new SettingsRepository(h.port);
    vi.mocked(h.port.get).mockRejectedValueOnce(new Error('synthetic_secret'));
    expect(await repository.commit(desired, 0, ID, current)).toEqual({ state: 'unavailable' });
    expect(await repository.commit(desired, 0, ID, current)).toMatchObject({ state: 'committed' });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
