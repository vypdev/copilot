import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, importedSettings, loadSettings, validSettings } from '../../src/domain/settings.ts';
import { DEFAULT_CENTER_SETTINGS } from '../../src/domain/center_settings.ts';
import type { CenterProfile } from '../../src/domain/center_profiles.ts';

const legacy = () => {
    const { center: _center, ...settings } = DEFAULT_SETTINGS;
    return { ...settings, schemaVersion: 1, revision: 8, density: 'compact' as const,
        repositories: { '42': { paused: true, connected: false } } };
};
const paused: CenterProfile = { id: 'paused', name: 'Paused repository', scope: {
    kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42' }, preferences: { paused: true } };
const withPause = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_CENTER_SETTINGS, profiles: [paused], selected: ['paused'] } };

it('bexh3-center-C43 migrates exact H2 v1 preferences and revision into v2 with safe center defaults', () => {
    const original = legacy(); const before = JSON.stringify(original); const result = loadSettings(original);
    expect(result).toMatchObject({ state: 'ready', migrated: true, settings: { schemaVersion: 2, revision: 8,
        density: 'compact', repositories: original.repositories, center: DEFAULT_CENTER_SETTINGS } });
    expect(loadSettings(result.settings)).toEqual({ state: 'ready', migrated: false, settings: result.settings });
    expect(JSON.stringify(original)).toBe(before); expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(result.settings.center)).toBe(true);
});
it('refuses partial, malformed and extra-key legacy records instead of silently filling required preferences', () => {
    for (const value of [{ schemaVersion: 1 }, { ...legacy(), extra: true }, { ...legacy(), density: 'giant' },
        { ...DEFAULT_SETTINGS, center: undefined }, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_CENTER_SETTINGS, notes: 'remote' } }]) {
        expect(loadSettings(value).state).toBe('invalid'); expect(validSettings(value)).toBe(false);
    }
});
it('bexh3-center-C44 keeps future root and nested center schemas inert without a destructive downgrade', () => {
    for (const value of [{ ...DEFAULT_SETTINGS, schemaVersion: 3 }, { ...DEFAULT_SETTINGS, center: {
        ...DEFAULT_CENTER_SETTINGS, schemaVersion: 2, unknownFutureValue: 'preserved' } }]) {
        const before = JSON.stringify(value); expect(loadSettings(value).state).toBe('future'); expect(JSON.stringify(value)).toBe(before);
    }
});
it('a valid legacy record too close to the total byte limit cannot be silently expanded or truncated', () => {
    const value = { ...legacy(), repositories: { '7': { savedViews: Array(20).fill('x'.repeat(2000)) },
        '8': { savedViews: [...Array(12).fill('x'.repeat(2000)), ''] } } };
    value.repositories['8'].savedViews[12] = 'x'.repeat(65530 - JSON.stringify(value).length);
    const before = JSON.stringify(value); expect(before.length).toBe(65530);
    expect(loadSettings(value)).toMatchObject({ state: 'invalid', migrated: false }); expect(JSON.stringify(value)).toBe(before);
});
it('import cannot remove a selected scoped pause by deleting, renaming, moving or deselecting its profile', () => {
    for (const center of [DEFAULT_CENTER_SETTINGS, { ...withPause.center, selected: [] },
        { ...withPause.center, profiles: [{ ...paused, preferences: { paused: false } }] },
        { ...withPause.center, profiles: [{ ...paused, scope: { ...paused.scope, accountId: '8' } }] }]) {
        expect(() => importedSettings(withPause, { ...DEFAULT_SETTINGS, center })).toThrow('settings-import-releases-profile-pause');
    }
    const renamed = { ...paused, id: 'renamed', name: 'Renamed safely' };
    expect(importedSettings(withPause, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_CENTER_SETTINGS,
        profiles: [renamed], selected: ['renamed'] } }).center.selected).toEqual(['renamed']);
});
it('global pause remains authoritative across import while unselected profiles do not create a pause guard', () => {
    expect(importedSettings({ ...withPause, paused: true }, DEFAULT_SETTINGS).paused).toBe(true);
    expect(importedSettings(withPause, { ...DEFAULT_SETTINGS, paused: true }).paused).toBe(true);
    expect(importedSettings({ ...withPause, center: { ...withPause.center, selected: [] } }, DEFAULT_SETTINGS).paused).toBe(false);
    expect(importedSettings({ ...withPause, center: { ...withPause.center, profiles: [{ ...paused, preferences: {} }] } }, DEFAULT_SETTINGS).paused).toBe(false);
});
it('import retains omitted repository pauses and copies incoming data without freezing or granting authority', () => {
    const current = { ...DEFAULT_SETTINGS, repositories: { '42': { paused: true, connected: true }, '43': { paused: false } } };
    const incoming = structuredClone(DEFAULT_SETTINGS);
    const result = importedSettings(current, incoming);
    expect(result.repositories).toEqual({ '42': { paused: true, connected: true } });
    expect(result.repositories).not.toHaveProperty('43'); expect(Object.isFrozen(incoming.center)).toBe(false);
    expect(Object.isFrozen(result.center)).toBe(true); expect(result.center).not.toBe(incoming.center);
});
it('import fails closed if retained pauses would overflow repository limits or the revision is exhausted', () => {
    const current = { ...DEFAULT_SETTINGS, repositories: { '999': { paused: true } } };
    const incoming = { ...DEFAULT_SETTINGS, repositories: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index + 1), {}])) };
    expect(() => importedSettings(current, incoming)).toThrow('settings-import-invalid-result');
    expect(() => importedSettings({ ...DEFAULT_SETTINGS, revision: Number.MAX_SAFE_INTEGER }, DEFAULT_SETTINGS)).toThrow('settings-import-invalid-result');
});
