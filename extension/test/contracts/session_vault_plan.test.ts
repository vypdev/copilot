import { expect, it } from 'vitest';
import { planSessionVault } from '../../src/domain/session_vault_plan.ts';
import { purposeEntry, purposeVault, readRoleVault } from '../fixtures/credential_roles.ts';

it.each(['issues-write', 'actions-write'] as const)('adding the %s identity preserves the read session and upgrades once without selecting an optional writer', purpose => {
    const before = readRoleVault(); const entry = purposeEntry(purpose); const intent = { type: 'connect-role' as const, purpose, name: entry.name, secret: entry.connection.secret, repository: entry.connection.repository };
    const next = planSessionVault(before, intent, entry); expect(next).toEqual({ ...before, schemaVersion: 2, revision: 4, entries: [...before.entries, entry], writeSelections: { 'issues-write': null, 'actions-write': null } });
    expect(before.entries).toHaveLength(1); expect(Object.isFrozen(next?.entries[1].connection)).toBe(true);
});
it('a new optional credential retains an existing purpose selection and cannot steal it merely by being saved', () => {
    const before = purposeVault(); const entry = purposeEntry('issues-write', 'another-issue', 'Another issue');
    const next = planSessionVault(before, { type: 'connect-role', purpose: 'issues-write', name: entry.name, secret: entry.connection.secret, repository: entry.connection.repository }, entry);
    expect(next).toMatchObject({ selected: 'read', writeSelections: before.writeSelections, revision: 5, entries: expect.any(Array) }); expect(next?.entries).toHaveLength(4);
});
it.each(['issues', 'actions'] as const)('explicit selection of %s changes only its own optional slot and keeps read ownership', id => {
    const before = purposeVault(); const entry = before.entries.find(entry => entry.id === id)!;
    const next = planSessionVault(before, { type: 'select', id }, entry); expect(next).toMatchObject({ selected: 'read', revision: 5,
        writeSelections: { ...before.writeSelections, [entry.role]: entry.id } }); expect(next?.entries).toEqual(before.entries);
});
it('selecting a read identity in a schema2 vault preserves optional selections rather than promoting their credentials', () => {
    const before = purposeVault(); const entry = before.entries[0]; expect(planSessionVault(before, { type: 'select', id: 'read' }, entry)).toEqual({ ...before, revision: 5 });
});
it('adding a read session preserves schema1 compatibility and does not invent optional authority', () => {
    const before = readRoleVault(); const entry = { ...purposeEntry('repository-read', 'second', 'Second read'), role: 'repository-read' as const };
    expect(planSessionVault(before, { type: 'connect', name: entry.name, secret: entry.connection.secret, repository: entry.connection.repository }, entry))
        .toEqual({ ...before, revision: 4, selected: 'second', entries: [...before.entries, entry] });
});
it.each(['issues-write', 'actions-write'] as const)('disabling %s preserves every credential and the other selected purposes', purpose => {
    const before = { ...purposeVault(), writeSelections: { 'issues-write': 'issues', 'actions-write': 'actions' } };
    expect(planSessionVault(before, { type: 'disable-role', purpose })).toEqual({ ...before, revision: 5, writeSelections: { ...before.writeSelections, [purpose]: null } });
});
it('an already disabled role does not create a native successor or upgrade a legacy read vault', () => {
    expect(planSessionVault(purposeVault(), { type: 'disable-role', purpose: 'actions-write' })).toBeNull();
    expect(planSessionVault(readRoleVault(), { type: 'disable-role', purpose: 'issues-write' })).toBeNull();
});
it.each(['read', 'issues', 'actions'] as const)('removing %s clears only the slots that actually selected it and keeps the remaining credentials', id => {
    const before = { ...purposeVault(), writeSelections: { 'issues-write': 'issues', 'actions-write': 'actions' } };
    const next = planSessionVault(before, { type: 'remove', id }); expect(next?.entries).toEqual(before.entries.filter(entry => entry.id !== id));
    expect(next).toMatchObject({ revision: 5, selected: id === 'read' ? null : 'read', writeSelections: { 'issues-write': id === 'issues' ? null : 'issues', 'actions-write': id === 'actions' ? null : 'actions' } });
});
it('disconnecting the read selection leaves separately selected optional identities intact', () => {
    const before = purposeVault(); const next = planSessionVault(before, { type: 'disconnect' }); expect(next).toMatchObject({ selected: null, writeSelections: before.writeSelections });
    expect(next?.entries.map(entry => entry.id)).toEqual(['issues', 'actions']);
});
it('disconnecting an already empty read slot retains compatibility without deleting another purpose', () => {
    const before = { ...purposeVault(), selected: null }; expect(planSessionVault(before, { type: 'disconnect' })).toEqual({ ...before, revision: 5 });
});
it('a legacy H2 alias must materialize a fresh local ID during an explicit read selection', () => {
    const original = readRoleVault().entries[0]; const legacy = { ...readRoleVault(), selected: 'previous-session', entries: [{ ...original, id: 'previous-session' }] };
    expect(planSessionVault(legacy, { type: 'select', id: 'previous-session' }, { ...original, id: 'materialized' })).toMatchObject({ selected: 'materialized', entries: [{ id: 'materialized' }] });
    expect(planSessionVault(legacy, { type: 'select', id: 'previous-session' }, legacy.entries[0])).toBeNull();
});
it.each(['role', 'name', 'secret', 'viewer', 'repository', 'id'] as const)('a changed %s cannot convert or replace a selected native identity', kind => {
    const before = purposeVault(); const source = before.entries[1]; const candidate = { ...source,
        ...(kind === 'role' ? { role: 'actions-write' as const } : kind === 'name' ? { name: 'Changed' } : kind === 'id' ? { id: 'changed' } : {}),
        connection: { ...source.connection, ...(kind === 'secret' ? { secret: 'github_pat_other_synthetic_token' } : kind === 'viewer' ? { viewerId: '2' } : kind === 'repository' ? { repositoryId: '8' } : {}) } };
    expect(planSessionVault(before, { type: 'select', id: source.id }, candidate)).toBeNull();
});
it('matching numeric identity may retain freshly verified canonical account/repository spelling', () => {
    const before = purposeVault(); const source = before.entries[1]; const candidate = { ...source, connection: { ...source.connection, viewerLogin: 'renamed', repository: 'renamed/current', organizationId: '9' } };
    expect(planSessionVault(before, { type: 'select', id: source.id, repository: 'renamed/current' }, candidate)?.entries[1]).toEqual(candidate);
});
it.each(['read-purpose', 'write-purpose', 'name', 'token', 'duplicate-id'] as const)('an inconsistent new %s cannot become a saved optional identity', kind => {
    const before = purposeVault(); const entry = purposeEntry('issues-write', 'new-issue', 'New issue'); const candidate = { ...entry,
        ...(kind === 'read-purpose' ? { role: 'repository-read' as const } : kind === 'write-purpose' ? { role: 'actions-write' as const } : kind === 'name' ? { name: 'Other' } : kind === 'duplicate-id' ? { id: 'read' } : {}),
        connection: { ...entry.connection, ...(kind === 'token' ? { secret: 'github_pat_different_synthetic' } : {}) } };
    expect(planSessionVault(before, { type: 'connect-role', purpose: 'issues-write', name: entry.name, secret: entry.connection.secret, repository: entry.connection.repository }, candidate)).toBeNull();
});
it('a sixth entry cannot be saved even when all individual names, identities and purposes are otherwise valid', () => {
    const before = { ...purposeVault(), entries: [...purposeVault().entries, purposeEntry('repository-read', 'four'), purposeEntry('actions-write', 'five')] };
    const entry = purposeEntry('issues-write', 'six'); expect(planSessionVault(before, { type: 'connect-role', purpose: 'issues-write', name: entry.name, secret: entry.connection.secret, repository: entry.connection.repository }, entry)).toBeNull();
});
it('missing selections/candidates and exhausted revisions cannot fabricate a native successor', () => {
    const before = purposeVault(); expect(planSessionVault(before, { type: 'remove', id: 'missing' })).toBeNull();
    expect(planSessionVault(before, { type: 'select', id: 'missing' }, before.entries[1])).toBeNull(); expect(planSessionVault(before, { type: 'select', id: 'issues' })).toBeNull();
    expect(planSessionVault({ ...before, revision: Number.MAX_SAFE_INTEGER }, { type: 'disconnect' })).toBeNull();
});
