import { expect, it } from 'vitest';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { profileScopeChoices, repositoryPreferenceRows, selectedProfileContext, centerProfileResolution } from '../../src/domain/profile_context.ts';
import { workspaceChoices, workspaceReferences } from '../../src/domain/workspace_references.ts';
import { profileDraft } from '../../src/domain/profile_draft.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { settingsReviewChanges } from '../../src/domain/center_frame.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { purposeEntry } from '../fixtures/credential_roles.ts';
import type { WritePurpose } from '../../src/domain/credential_roles.ts';

function fixture(purpose: WritePurpose) {
    const read = purposeEntry('repository-read', 'read', 'Read account'); const source = purposeEntry(purpose, 'writer', 'Private writer');
    const writer = { ...source, connection: { ...source.connection, viewerId: '2', viewerLogin: 'writer', repositoryId: '8', repository: 'writer/private', organizationId: '9' } };
    const view = connectionsView({ schemaVersion: 2, revision: 4, selected: read.id, entries: [writer, read], writeSelections: { 'issues-write': purpose === 'issues-write' ? writer.id : null, 'actions-write': purpose === 'actions-write' ? writer.id : null } }, true, 3, [purpose]);
    return { view, read, writer, group: { id: 'g', name: 'Group', members: [] as string[] } };
}
it.each(['issues-write', 'actions-write'] as const)('profile scope choices do not advertise a saved %s identity as a read account or its repository/organization', purpose => {
    const { view } = fixture(purpose); const choices = profileScopeChoices(view, { ...profileDraft(), accountId: '1' });
    expect(choices.accounts).toEqual([{ value: '1', label: 'octo', known: true }]); expect(choices.repositories.map(item => item.value)).toEqual(['7']);
    expect(profileScopeChoices(view, { ...profileDraft(), accountId: '2' }).organizations).toEqual([]);
});
it.each(['issues-write', 'actions-write'] as const)('an authored scope matching only %s keeps its opaque values without borrowing private write-role labels', purpose => {
    const { view } = fixture(purpose); const choices = profileScopeChoices(view, { ...profileDraft(), accountId: '2', repositoryId: '8', organizationId: '9' });
    expect(choices.accounts.find(item => item.value === '2')).toEqual({ value: '2', label: '2', known: false });
    expect(choices.repositories).toEqual([{ value: '8', label: '8', known: false }]); expect(choices.organizations).toEqual([{ value: '9', label: '9', known: false }]);
});
it.each(['issues-write', 'actions-write'] as const)('repository preference rows do not acquire a separate %s target', purpose => {
    const { view } = fixture(purpose); expect(repositoryPreferenceRows(DEFAULT_SETTINGS, view)).toEqual([{ id: '7', name: 'octo/example', account: 'octo', paused: false }]);
});
it.each(['issues-write', 'actions-write'] as const)('workspace creation offers only read references while excluding selected and verified %s entries', purpose => {
    const { view, group } = fixture(purpose); expect(workspaceChoices(group, view).map(item => item.id)).toEqual(['read']);
});
it.each(['issues-write', 'actions-write'] as const)('a retained workspace slot naming a %s entry stays missing and cannot offer read verification or private labels', purpose => {
    const { view, group } = fixture(purpose); expect(workspaceReferences({ ...group, members: ['writer', 'read'] }, view)).toMatchObject([
        { id: 'writer', slot: 1, state: 'missing', entry: null, connected: false, revision: null }, { id: 'read', slot: 2, state: 'saved', connected: true }]);
});
it.each(['issues-write', 'actions-write'] as const)('a workspace review leaves the %s reference unavailable while labeling its read reference', purpose => {
    const { view, group } = fixture(purpose);
    const after = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, workspaces: [{ ...group, members: ['writer', 'read'] }] } };
    const rows = settingsReviewChanges(DEFAULT_SETTINGS, after, centerCopy('en'), view);
    expect(rows.find(row => row.id.endsWith('/writer'))?.label).toContain('Unavailable saved reference 1');
    expect(rows.find(row => row.id.endsWith('/read'))?.label).toContain('Read account · octo/example');
    expect(JSON.stringify(rows)).not.toMatch(/Private writer|writer\/private/u);
});
it.each(['issues-write', 'actions-write'] as const)('even a malformed read selection naming %s cannot activate scoped profile preferences', purpose => {
    const { view } = fixture(purpose); const malformed = { ...view, selected: 'writer' };
    const settings = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'writer', name: 'Writer profile', scope: { kind: 'account' as const, host: 'github.com' as const, accountId: '2' }, preferences: { density: 'compact' as const } }], selected: ['writer'] } };
    expect(selectedProfileContext(malformed).entry).toBeNull(); expect(centerProfileResolution(settings, malformed).preferences.density).toBe('comfortable');
});
