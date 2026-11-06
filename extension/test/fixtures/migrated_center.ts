import { DEFAULT_SETTINGS, validSettings } from '../../src/domain/settings.ts';
import { scopedCenterFixture } from './scoped_center.ts';

/** Supported nested schema migration with authored values in every personal preference group. */
export async function migratedCenterFixture() {
    const scoped = await scopedCenterFixture();
    const expected = { ...DEFAULT_SETTINGS, revision: 8, locale: 'es' as const, theme: 'dark' as const,
        shortcuts: true, features: { 'BEX-NAV-01': true },
        repositories: { '7': { connected: true } },
        center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: 'Private work',
            scope: { kind: 'repository' as const, host: 'github.com' as const, accountId: '1', repositoryId: '7' },
            preferences: { density: 'compact' as const, features: { 'BEX-NAV-01': false } } }], selected: ['work'],
        favorites: ['BEX-NAV-01'], bindings: [{ command: 'open-help' as const, binding: 'Alt+Shift+H' as const }],
        appearance: { text: 'large' as const, motion: 'reduced' as const, contrast: 'high' as const },
        onboarding: 'permissions' as const, diagnostics: true, recents: true, notes: 'local' as const } };
    if (!validSettings(expected)) throw new Error('invalid-migration-fixture');
    const { workspaces: _groups, selectedWorkspace: _selection, ...center } = expected.center;
    const original = { ...expected, center: { ...center, schemaVersion: 1 } };
    return { ...scoped, expected, original };
}
