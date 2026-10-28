import { expect, it } from 'vitest';
import { profileScopeChoices, scopeChoiceText, selectedProfileContext, centerProfileResolution, sourceProfileName, repositoryPreferenceRows } from '../../src/domain/profile_context.ts';
import { profileContextCopy } from '../../src/domain/profile_context_copy.ts';
import { profileDraft } from '../../src/domain/profile_draft.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import type { ConnectionsView } from '../../src/domain/named_sessions.ts';
const entry = { id: 'work', name: 'Work', host: 'github.com', role: 'repository-read', viewerId: '1', viewerLogin: 'octo', repositoryId: '7', repository: 'company/example', organizationId: '55' } as const;
const view: ConnectionsView = { state: 'ready', revision: 2, connected: true, selected: 'work', entries: [entry,
    { ...entry, id: 'personal', viewerId: '2', viewerLogin: 'other', repositoryId: '8', organizationId: null }, { ...entry, id: 'duplicate' }] };
it('offers deduplicated provider IDs partitioned by account and retains unavailable authored scopes instead of deleting them', () => {
    const draft = { ...profileDraft(), accountId: '1', repositoryId: '999', organizationId: '888' };
    const choices = profileScopeChoices(view, draft);
    expect(choices.accounts).toEqual([{ value: '1', label: 'octo', known: true }, { value: '2', label: 'other', known: true }]);
    expect(choices.repositories).toEqual([{ value: '7', label: 'company/example', known: true }, { value: '999', label: '999', known: false }]);
    expect(choices.organizations).toEqual([{ value: '55', label: 'company', known: true }, { value: '888', label: '888', known: false }]);
    expect(profileScopeChoices(view, { ...draft, accountId: '2', repositoryId: '', organizationId: '' }).organizations).toEqual([]);
    expect(profileScopeChoices({ state: 'unavailable' }, { ...draft, accountId: '3' }).accounts).toEqual([{ value: '3', label: '3', known: false }]);
    expect(profileScopeChoices(null, profileDraft()).accounts).toEqual([]); expect(Object.isFrozen(choices.repositories)).toBe(true);
    expect(scopeChoiceText(choices.accounts[0], 'Unavailable')).toBe('octo'); expect(scopeChoiceText(choices.repositories[1], 'Unavailable')).toBe('999 · Unavailable');
});
it('uses only the currently connected verified selection for effective scope and preserves inherited pause and preference sources', () => {
    const settings = { ...DEFAULT_SETTINGS, paused: true, repositories: { '7': { density: 'compact' as const } },
        center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: '<Work>', scope: { kind: 'organization' as const, host: 'github.com' as const, accountId: '1', organizationId: '55' }, preferences: { shortcuts: true, paused: false } }], selected: ['work'] } };
    const result = centerProfileResolution(settings, view);
    expect(result.preferences).toMatchObject({ paused: true, density: 'compact', shortcuts: true, sources: { paused: 'global', density: 'repository', shortcuts: 'profile:work' } });
    expect(sourceProfileName('profile:work', settings)).toBe('<Work>'); expect(sourceProfileName('profile:missing', settings)).toBeNull(); expect(sourceProfileName('global', settings)).toBeNull();
    for (const absent of [null, { state: 'unavailable' } as const, { ...view, connected: false }, { ...view, selected: 'missing' }]) {
        expect(selectedProfileContext(absent).entry).toBeNull(); expect(centerProfileResolution(settings, absent).preferences.shortcuts).toBe(false);
    }
    expect(selectedProfileContext(view).context).toMatchObject({ accountId: '1', repositoryId: '7', organizationId: '55', sessionEpoch: null });
});
it('groups the same physical repository by numeric ID, prefers its selected canonical name and never conflates another repository', () => {
    const rows = repositoryPreferenceRows({ ...DEFAULT_SETTINGS, repositories: { '7': { paused: true } } }, { ...view, entries: [
        { ...entry, id: 'old', repository: 'company/old' }, entry, { ...entry, id: 'third', repositoryId: '9' }, { ...entry, id: 'stale-after', repository: 'company/old' }] });
    expect(rows).toEqual([{ id: '7', name: 'company/example', account: 'octo', paused: true }, { id: '9', name: 'company/example', account: 'octo', paused: false }]);
    expect(repositoryPreferenceRows(DEFAULT_SETTINGS, { state: 'unknown' })).toEqual([]);
});
it('provides complete immutable scope, provenance and recovery content in all four locales', () => {
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const copy = profileContextCopy(locale); expect(Object.isFrozen(copy)).toBe(true);
        expect(Object.keys(copy)).toEqual(Object.keys(profileContextCopy('en'))); expect(Object.values(copy).every(value => value.length > 0)).toBe(true);
    }
});
