import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, validSettings } from '../../src/domain/settings.ts';
import { planSettingsChange } from '../../src/domain/settings_change.ts';
const groups = { workspaces: [{ id: 'review', name: 'Review work', members: ['previous-session'] }], selectedWorkspace: 'review' };
it('admits bounded authored grouping in the new nested schema without introducing protected metadata', () => {
    expect(validSettings({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, schemaVersion: 2, ...groups } })).toBe(true);
});
it('an exact previous center schema migrates additively while preserving all existing preferences', () => {
    const { workspaces: _groups, selectedWorkspace: _selected, ...center } = DEFAULT_SETTINGS.center as unknown as Record<string, unknown>;
    const input = { ...DEFAULT_SETTINGS, center: { ...center, schemaVersion: 1 } }; const original = JSON.stringify(input);
    expect(loadSettings(input)).toMatchObject({ state: 'ready', migrated: true, settings: { center: { schemaVersion: 2, workspaces: [], selectedWorkspace: null } } });
    expect(JSON.stringify(input)).toBe(original);
});
it('workspace edits enter retained local preference planning rather than connection or provider authority', () => {
    const result = planSettingsChange(DEFAULT_SETTINGS, { type: 'workspace', change: { type: 'save', workspace: groups.workspaces[0] } });
    expect(result).toMatchObject({ state: 'ready', action: 'center-preferences', settings: { center: { workspaces: groups.workspaces, selectedWorkspace: null } } });
});
it('an invalid workspace intent and an unchanged workspace reset stay distinct without a mutation plan', () => {
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'workspace', change: { type: 'save', workspace: { id: 'Bad' } } })).toEqual({ state: 'invalid', reason: 'invalid-input' });
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'workspace', change: { type: 'reset' } })).toEqual({ state: 'unchanged' });
});
it('malformed exact old center documents are preserved rather than migrated into a fabricated valid group', () => {
    const { workspaces: _w, selectedWorkspace: _s, ...old } = DEFAULT_SETTINGS.center;
    for (const patch of [{ notes: 'cloud' }, { appearance: null }, { profiles: null }]) {
        const value = { ...DEFAULT_SETTINGS, center: { ...old, schemaVersion: 1, ...patch } }; const original = JSON.stringify(value);
        expect(loadSettings(value).state).toBe('invalid'); expect(JSON.stringify(value)).toBe(original);
    }
});
