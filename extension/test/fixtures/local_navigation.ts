import { DEFAULT_SETTINGS, validSettings, type Settings } from '../../src/domain/settings.ts';

export function navigationSettings(): Settings {
    const settings: Settings = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center,
        favorites: ['BEX-CODE-01', 'BEX-CENTER-11'], profiles: [
            { id: 'work', name: 'Work <safe>', scope: { kind: 'host', host: 'github.com' }, preferences: { paused: true } },
            { id: 'personal', name: 'Personal', scope: { kind: 'global' }, preferences: { density: 'compact' } }],
        selected: ['work'], workspaces: [{ id: 'team', name: 'Team <safe>', members: ['unbound-0-0', 'opaque-session-reference'] }], selectedWorkspace: 'team' } };
    if (!validSettings(settings)) throw new Error('invalid-navigation-fixture'); return settings;
}
