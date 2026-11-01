import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { planSettingsChange } from '../../src/domain/settings_change.ts';
import type { CenterProfile } from '../../src/domain/center_profiles.ts';

const profile: CenterProfile = { id: 'personal', name: 'Personal', scope: { kind: 'global' }, preferences: { paused: true } };
const current = { ...DEFAULT_SETTINGS, revision: 8, density: 'compact' as const, locale: 'es' as const, theme: 'dark' as const,
    repositories: { '42': { paused: true, connected: true }, '43': { savedViews: ['is:issue'] } }, center: { ...DEFAULT_SETTINGS.center,
        profiles: [profile], selected: ['personal'], favorites: ['BEX-NAV-01'], appearance: { text: 'large' as const, motion: 'reduced' as const, contrast: 'high' as const } } };

it('bexh3-center-C05 rejects future, malformed and absent imports without modifying current preferences', () => {
    expect(planSettingsChange(current, { type: 'import', settings: { schemaVersion: 99 } })).toEqual({ state: 'invalid', reason: 'future-schema' });
    for (const intent of [{ type: 'import', settings: {} }, { type: 'import' }, { type: 'import', settings: undefined },
        { type: 'import', settings: DEFAULT_SETTINGS, extra: true }]) expect(planSettingsChange(current, intent))
        .toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('bexh3-center-C06 plans a supported legacy import while preserving current pause and connection boundaries', () => {
    const { center: _center, ...legacy } = DEFAULT_SETTINGS;
    const withoutSelectedPause = { ...current, paused: true, center: { ...current.center, selected: [] } };
    const result = planSettingsChange(withoutSelectedPause, { type: 'import', settings: { ...legacy, schemaVersion: 1, density: 'compact' } });
    expect(result).toMatchObject({ state: 'ready', action: 'import', settings: { schemaVersion: 2, revision: 8, density: 'compact',
        paused: true, repositories: { '42': { paused: true, connected: true } } } });
    expect(planSettingsChange(current, { type: 'import', settings: DEFAULT_SETTINGS })).toEqual({ state: 'invalid', reason: 'pause-protected' });
    const full = { ...DEFAULT_SETTINGS, repositories: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index + 100), {}])) };
    expect(planSettingsChange(withoutSelectedPause, { type: 'import', settings: full })).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('rollback plans only known previous settings and cannot restore an old connection grant', () => {
    const previous = { ...DEFAULT_SETTINGS, repositories: { '42': { connected: true, density: 'compact' as const },
        '44': { connected: true }, '45': { density: 'compact' as const } } };
    expect(planSettingsChange(current, { type: 'rollback' }, previous)).toMatchObject({ state: 'ready', action: 'rollback', settings: {
        revision: 8, repositories: { '42': { connected: true }, '44': { connected: false }, '45': { connected: false } } } });
    for (const previous of [null, {}]) expect(planSettingsChange(current, { type: 'rollback' }, previous as typeof DEFAULT_SETTINGS | null))
        .toEqual({ state: 'invalid', reason: 'no-rollback' });
    expect(planSettingsChange(current, { type: 'rollback', arbitraryPath: 'private' }, previous)).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('bexh3-center-C07 global reset preserves repository and center-authored data', () => {
    expect(planSettingsChange(current, { type: 'reset', scope: 'global' })).toMatchObject({ state: 'ready', action: 'reset-global', settings: {
        revision: 8, locale: 'auto', density: 'comfortable', theme: 'github', repositories: current.repositories, center: current.center } });
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'reset', scope: 'global' })).toEqual({ state: 'unchanged' });
});
it('profile reset and appearance reset affect their explicit scopes independently', () => {
    expect(planSettingsChange(current, { type: 'reset', scope: 'profiles' })).toMatchObject({ state: 'ready', action: 'reset-profiles',
        settings: { density: 'compact', center: { profiles: [], selected: [], favorites: current.center.favorites, appearance: current.center.appearance } } });
    expect(planSettingsChange(current, { type: 'reset', scope: 'appearance' })).toMatchObject({ state: 'ready', action: 'reset-appearance',
        settings: { theme: 'github', density: 'comfortable', locale: 'es', center: { profiles: [profile], appearance: DEFAULT_SETTINGS.center.appearance } } });
});
it('repository reset clears only selected authored preferences, keeping an actual current connection opt-in', () => {
    expect(planSettingsChange(current, { type: 'reset', scope: 'repository', repositoryId: '42' })).toMatchObject({ state: 'ready', action: 'reset-repository',
        settings: { repositories: { '42': { connected: true }, '43': current.repositories['43'] } } });
    const result = planSettingsChange(current, { type: 'reset', scope: 'repository', repositoryId: '43' });
    if (result.state !== 'ready') throw new Error('expected preview'); expect(result.settings.repositories).not.toHaveProperty('43');
    expect(result.settings.repositories['42']).toEqual(current.repositories['42']);
    expect(planSettingsChange(current, { type: 'reset', scope: 'repository', repositoryId: '44' })).toEqual({ state: 'unchanged' });
});
it('complete settings reset still preserves the separate current credential/grant state rather than inventing a disconnect', () => {
    const result = planSettingsChange(current, { type: 'reset', scope: 'all' });
    expect(result).toEqual({ state: 'ready', action: 'reset-all', settings: { ...DEFAULT_SETTINGS, revision: 8, repositories: { '42': { connected: true } } } });
    expect(current.center.selected).toEqual(['personal']);
});
it('unknown reset scopes, crossed repository parameters and caller-supplied grants remain invalid', () => {
    for (const intent of [{ type: 'reset', scope: 'shell' }, { type: 'reset', scope: 'repository' },
        { type: 'reset', scope: 'repository', repositoryId: '0' }, { type: 'reset', scope: 'global', repositoryId: '42' },
        { type: 'reset', scope: 'all', includeCredentials: true }]) expect(planSettingsChange(current, intent))
        .toEqual({ state: 'invalid', reason: 'invalid-input' });
});
