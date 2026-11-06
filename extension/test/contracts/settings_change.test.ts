import { expect, it } from 'vitest';
import { planSettingsChange, MAX_CENTER_REQUEST_BYTES } from '../../src/domain/settings_change.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import type { CenterProfile } from '../../src/domain/center_profiles.ts';

const profile: CenterProfile = { id: 'personal', name: 'Personal', scope: { kind: 'global' }, preferences: { density: 'compact' } };
const configured = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['personal'] } };

it('profile intents project complete validated settings without changing unrelated preferences or input objects', () => {
    const before = JSON.stringify(DEFAULT_SETTINGS);
    const result = planSettingsChange(DEFAULT_SETTINGS, { type: 'profile', change: { type: 'save', profile } });
    expect(result).toMatchObject({ state: 'ready', action: 'profile-create', settings: { revision: 0, center: { profiles: [profile], selected: [] } } });
    if (result.state !== 'ready') throw new Error('expected preview');
    expect(Object.isFrozen(result.settings.center.profiles[0])).toBe(true); expect(Object.isFrozen(profile)).toBe(false);
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
    expect(planSettingsChange(configured, { type: 'profile', change: { type: 'save', profile } })).toEqual({ state: 'unchanged' });
});
it('invalid profile plans retain specific capacity, missing-target and conflicting-scope recovery reasons', () => {
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'profile', change: {} })).toEqual({ state: 'invalid', reason: 'profile-invalid' });
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'profile', change: { type: 'remove', id: 'missing' } }))
        .toEqual({ state: 'invalid', reason: 'profile-not-found' });
    const profiles = Array.from({ length: 10 }, (_, index) => ({ ...profile, id: `profile-${index}` }));
    expect(planSettingsChange({ ...configured, center: { ...configured.center, profiles, selected: [] } },
        { type: 'profile', change: { type: 'save', profile } })).toEqual({ state: 'invalid', reason: 'profile-capacity' });
    const repo: CenterProfile = { ...profile, id: 'repo', scope: { kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42' } };
    const current = { ...configured, center: { ...configured.center, profiles: [profile, repo], selected: ['personal', 'repo'] } };
    expect(planSettingsChange(current, { type: 'profile', change: { type: 'save', profile: { ...repo, scope: { kind: 'global' } } } }))
        .toEqual({ state: 'invalid', reason: 'profile-conflict' });
});
it('global feature edits merge known values and remove an override explicitly with null', () => {
    const current = { ...DEFAULT_SETTINGS, features: { 'BEX-NAV-01': true, 'BEX-NAV-02': false } };
    expect(planSettingsChange(current, { type: 'preferences', values: { locale: 'es', features: { 'BEX-NAV-01': null, 'BEX-NAV-03': false } } }))
        .toMatchObject({ state: 'ready', action: 'preferences', settings: { locale: 'es', features: { 'BEX-NAV-02': false, 'BEX-NAV-03': false } } });
    const removed = planSettingsChange(current, { type: 'preferences', values: { features: { 'BEX-NAV-01': null } } });
    if (removed.state !== 'ready') throw new Error('expected preview'); expect(removed.settings.features).not.toHaveProperty('BEX-NAV-01');
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'preferences', values: {} })).toEqual({ state: 'unchanged' });
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'preferences', values: { theme: 'dark', paused: true, shortcuts: true, density: 'compact' } }))
        .toMatchObject({ state: 'ready', settings: { theme: 'dark', paused: true, shortcuts: true, density: 'compact' } });
});
it('feature and scalar validation refuses unknown activation keys, arbitrary values and authority fields', () => {
    for (const values of [null, [], { features: null }, { features: { 'BEX-UNKNOWN-01': null } },
        { features: { 'BEX-NAV-01': 'yes' } }, { features: undefined }, { locale: 'xx' }, { theme: 'remote' },
        { connected: true }, { schemaVersion: 9 }, { revision: 9 }, { center: {} }]) {
        expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'preferences', values })).toEqual({ state: 'invalid', reason: 'invalid-input' });
    }
});
it('center edits cover authored favorites, bounded bindings, appearance and retention without replacing profiles', () => {
    const values = { favorites: ['BEX-NAV-01'], bindings: [{ command: 'open-help', binding: 'Alt+Shift+H' }],
        appearance: { text: 'large', motion: 'reduced', contrast: 'high' }, onboarding: 'complete', recents: true, diagnostics: true, notes: 'local' };
    expect(planSettingsChange(configured, { type: 'center', values })).toMatchObject({ state: 'ready', action: 'center-preferences',
        settings: { center: { ...values, profiles: [profile], selected: ['personal'] } } });
    for (const values of [{ profiles: [] }, { selected: [] }, { schemaVersion: 2 }, { permission: 'granted' }, { favorites: ['unknown'] },
        { appearance: { text: 'tiny' } }, null]) expect(planSettingsChange(configured, { type: 'center', values }))
        .toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('repository edits preserve connection authority and distinguish inherited, disabled and saved-view preferences', () => {
    const current = { ...DEFAULT_SETTINGS, repositories: { '42': { connected: true, features: { 'BEX-NAV-01': true } } } };
    const result = planSettingsChange(current, { type: 'repository', repositoryId: '42',
        preferences: { features: { 'BEX-NAV-01': null, 'BEX-NAV-02': false }, savedViews: ['is:issue'], paused: true } });
    expect(result).toMatchObject({ state: 'ready', action: 'repository-preferences', settings: { repositories: { '42': {
        connected: true, features: { 'BEX-NAV-02': false }, savedViews: ['is:issue'], paused: true } } } });
    if (result.state !== 'ready') throw new Error('expected preview'); expect(result.settings.repositories['42'].features).not.toHaveProperty('BEX-NAV-01');
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'repository', repositoryId: '43', preferences: { features: { 'BEX-NAV-01': false } } }))
        .toMatchObject({ state: 'ready', settings: { repositories: { '43': { features: { 'BEX-NAV-01': false } } } } });
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'repository', repositoryId: '43', preferences: {} })).toEqual({ state: 'unchanged' });
});
it('invalid repository rules cannot nominate hosts, acquire a connection or introduce unsupported feature data', () => {
    for (const intent of [{ type: 'repository', repositoryId: '0', preferences: {} },
        { type: 'repository', repositoryId: '42', preferences: null },
        { type: 'repository', repositoryId: '42', preferences: { connected: true } },
        { type: 'repository', repositoryId: '42', preferences: { features: [] } },
        { type: 'repository', repositoryId: '42', preferences: { features: { 'unknown': true } } },
        { type: 'repository', repositoryId: '42', preferences: { savedViews: ['unsafe\n'] } },
        { type: 'repository', repositoryId: '42', preferences: {}, host: 'other.invalid' }]) {
        expect(planSettingsChange(DEFAULT_SETTINGS, intent)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    }
});
it('oversized, cyclic, future-current and extra-key changes never create a partially normalized plan', () => {
    const cyclic: Record<string, unknown> = { type: 'preferences' }; cyclic.values = cyclic;
    for (const intent of [null, [], {}, cyclic, { type: 'apply', shell: 'run' }, { type: 'profile', change: {}, extra: true },
        { type: 'preferences', values: {}, extra: true }, { type: 'center', values: {}, extra: true },
        { type: 'preferences', values: { locale: 'x'.repeat(MAX_CENTER_REQUEST_BYTES) } }]) {
        expect(planSettingsChange(DEFAULT_SETTINGS, intent)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    }
    expect(planSettingsChange({ ...DEFAULT_SETTINGS, schemaVersion: 99 } as unknown as typeof DEFAULT_SETTINGS,
        { type: 'preferences', values: {} })).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
