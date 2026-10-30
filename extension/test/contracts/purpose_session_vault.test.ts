import { expect, it } from 'vitest';
import { copyNativeSessionVault, sameNativeSessionVault, upgradeSessionVault, validNativeSessionVault } from '../../src/domain/purpose_session_vault.ts';
import { validSessionEntries, sessionName, repositoryAddress } from '../../src/domain/session_vault_entries.ts';
import { purposeEntry, purposeVault, readRoleVault } from '../fixtures/credential_roles.ts';

it('an explicit schema1 upgrade preserves the read selection, numeric identities and credentials while optional selections remain off', () => {
    const original = readRoleVault(); const before = structuredClone(original); const next = upgradeSessionVault(original);
    expect(next).toEqual({ ...before, schemaVersion: 2, writeSelections: { 'issues-write': null, 'actions-write': null } });
    expect(original).toEqual(before); expect(next.entries[0]).not.toBe(original.entries[0]); expect(Object.isFrozen(next.entries[0].connection)).toBe(true);
    expect(validNativeSessionVault(original)).toBe(true); expect(validNativeSessionVault(next)).toBe(true); expect(sameNativeSessionVault(original, before)).toBe(true);
});
it('known purpose-aware native state has one capacity and independent read/optional selections', () => {
    const vault = purposeVault(); expect(validNativeSessionVault(vault)).toBe(true); expect(sameNativeSessionVault(vault, vault)).toBe(true);
    expect(validNativeSessionVault({ ...vault, selected: null, writeSelections: { 'issues-write': null, 'actions-write': 'actions' } })).toBe(true);
});
it.each([
    ['absent snapshot', null], ['missing metadata', {}], ['future schema', { ...purposeVault(), schemaVersion: 3 }],
    ['negative revision', { ...purposeVault(), revision: -1 }], ['unsafe revision', { ...purposeVault(), revision: Number.MAX_SAFE_INTEGER + 1 }],
    ['private extra field', { ...purposeVault(), token: 'private' }], ['missing optional slots', { ...readRoleVault(), schemaVersion: 2 }],
    ['schema1 optional field', { ...readRoleVault(), writeSelections: {} }], ['schema1 writer', { ...readRoleVault(), entries: [purposeEntry('issues-write')] }],
    ['missing read selection', { ...purposeVault(), selected: 'missing' }], ['writer in read slot', { ...purposeVault(), selected: 'issues' }],
    ['non-text read selection', { ...purposeVault(), selected: 7 }], ['cross-purpose optional slot', { ...purposeVault(), writeSelections: { 'issues-write': 'actions', 'actions-write': null } }],
    ['oversized native snapshot', { ...purposeVault(), extra: 'x'.repeat(16 * 1024) }],
])('a %s is unavailable native state, never a destructive migration candidate', (_name, value) => {
    expect(validNativeSessionVault(value)).toBe(false); expect(copyNativeSessionVault(value)).toBeNull();
});
it.each([
    ['missing array', null], ['sparse entries', Array(1)], ['six total entries', Array.from({ length: 6 }, (_, i) => purposeEntry('repository-read', `read-${i}`))],
    ['duplicate local ID', [purposeEntry('repository-read', 'same', 'First'), purposeEntry('actions-write', 'same', 'Second')]],
    ['duplicate local name', [purposeEntry('repository-read', 'first', 'Work'), purposeEntry('actions-write', 'second', 'work')]],
    ['foreign host', [{ ...purposeEntry('repository-read'), host: 'elsewhere.test' }]], ['unknown purpose', [{ ...purposeEntry('repository-read'), role: 'setup' }]],
    ['empty name', [{ ...purposeEntry('repository-read'), name: '' }]], ['invalid local ID', [{ ...purposeEntry('repository-read'), id: 'Bad' }]],
    ['private outer field', [{ ...purposeEntry('repository-read'), secret: 'private' }]], ['invalid identity', [{ ...purposeEntry('repository-read'), connection: {} }]],
    ['null entry', [null]],
])('the %s entry collection cannot bypass the global native constraints', (_name, entries) => {
    expect(validSessionEntries(entries)).toBe(false);
});
it('five entries across all purposes share one capacity, while an existing same-purpose credential can retain its named read aliases', () => {
    const entries = [...purposeVault().entries, purposeEntry('repository-read', 'other-read'), purposeEntry('issues-write', 'other-issues')];
    expect(validSessionEntries(entries)).toBe(true); expect(validNativeSessionVault({ ...purposeVault(), entries })).toBe(true);
    expect(validSessionEntries([purposeEntry('issues-write')], ['repository-read'])).toBe(false);
});
it.each(['issues-write', 'actions-write'] as const)('a read credential cannot be reused by the %s purpose', purpose => {
    const read = purposeEntry('repository-read', 'read'); const writer = { ...purposeEntry(purpose), connection: { ...read.connection } };
    expect(validSessionEntries([read, writer])).toBe(false);
});
it('one optional write credential cannot cross into the other optional purpose', () => {
    const issue = purposeEntry('issues-write'); const action = { ...purposeEntry('actions-write'), connection: { ...issue.connection } };
    expect(validSessionEntries([issue, action])).toBe(false);
});
it('legacy read tokens remain readable, while a native optional role cannot store an unsupported token family', () => {
    const read = { ...purposeEntry('repository-read'), connection: { ...readRoleVault().entries[0].connection, secret: 'legacy_synthetic_read' } };
    expect(validSessionEntries([read])).toBe(true);
    expect(validSessionEntries([{ ...purposeEntry('issues-write'), connection: read.connection }])).toBe(false);
});
it.each(['issues-write', 'actions-write'] as const)('the reserved previous-session alias cannot materialize or select a %s identity', purpose => {
    const entry = purposeEntry(purpose, 'previous-session'); expect(validSessionEntries([entry])).toBe(false);
    expect(validNativeSessionVault({ schemaVersion: 2, revision: 0, selected: null, entries: [entry], writeSelections: { 'issues-write': null, 'actions-write': null } })).toBe(false);
});
it.each(['revision', 'schema', 'read-selection', 'issue-selection', 'action-selection', 'count', 'order', 'name', 'role', 'identity', 'secret'] as const)('changed %s cannot establish canonical equality with a previously observed vault', kind => {
    const original = purposeVault(); let next: unknown = structuredClone(original); const value = next as ReturnType<typeof purposeVault>;
    if (kind === 'revision') next = { ...value, revision: 5 }; if (kind === 'schema') next = readRoleVault(); if (kind === 'read-selection') next = { ...value, selected: null };
    if (kind === 'issue-selection') next = { ...value, writeSelections: { ...value.writeSelections, 'issues-write': null } };
    if (kind === 'action-selection') next = { ...value, writeSelections: { ...value.writeSelections, 'actions-write': 'actions' } };
    if (kind === 'count') next = { ...value, entries: [...value.entries, purposeEntry('repository-read', 'more')] };
    if (kind === 'order') next = { ...value, entries: [...value.entries].reverse() };
    if (kind === 'name' || kind === 'role' || kind === 'identity' || kind === 'secret') next = { ...value, entries: value.entries.map((entry, index) => index !== 2 ? entry
        : kind === 'name' ? { ...entry, name: 'Different' } : kind === 'role' ? { ...entry, role: 'issues-write' }
            : { ...entry, connection: { ...entry.connection, ...(kind === 'identity' ? { viewerId: '2' } : { secret: 'other_synthetic_credential' }) } }) };
    expect(sameNativeSessionVault(next, original)).toBe(false);
});
it('canonical equality ignores object key insertion order without ignoring entry order or optional organization identity', () => {
    const vault = purposeVault(); const reordered = { entries: vault.entries.map(entry => ({ connection: { repository: entry.connection.repository, repositoryId: '7', viewerLogin: 'octo', viewerId: '1', secret: entry.connection.secret, schemaVersion: 1 },
        role: entry.role, host: entry.host, name: entry.name, id: entry.id })), writeSelections: { 'actions-write': null, 'issues-write': 'issues' }, selected: 'read', revision: 4, schemaVersion: 2 };
    expect(sameNativeSessionVault(reordered, vault)).toBe(true); expect(sameNativeSessionVault({ ...vault, entries: vault.entries.map(entry => ({ ...entry, connection: { ...entry.connection, organizationId: null } })) }, vault)).toBe(false);
});
it('a retained detached snapshot is immutable and its source cannot mutate the role selection or credential later', () => {
    const original = purposeVault(); const copied = copyNativeSessionVault(original); expect(copied).toEqual(original);
    expect(Object.isFrozen(copied?.entries[0].connection)).toBe(true); expect(copied?.entries).not.toBe(original.entries);
});
it('a throwing native accessor is contained and a serialization substitution is validated again', () => {
    const throwing = purposeVault(); Object.defineProperty(throwing, 'revision', { get: () => { throw new Error('private native failure'); } });
    expect(copyNativeSessionVault(throwing)).toBeNull();
    const changing = purposeVault(); let serializations = 0; Object.defineProperty(changing, 'toJSON', { value: () => ++serializations === 1 ? changing : { schemaVersion: 9 } });
    expect(copyNativeSessionVault(changing)).toBeNull();
});
it.each(['', ' ', 'x'.repeat(65), 'name\n', 'name\u202e', null])('an invalid local name %j cannot label a role entry', name => { expect(sessionName(name)).toBe(false); });
it.each(['https://elsewhere.test/repo', 'owner/..', './repo', 'owner/repo/extra', 'a'.repeat(202), null])('an invalid repository %j cannot nominate a role target', repository => { expect(repositoryAddress(repository)).toBe(false); });
it('role labels and repository addresses support existing bounded local names and canonical GitHub spelling', () => {
    expect(sessionName('Work — équipe')).toBe(true); expect(repositoryAddress('Owner/repository.name')).toBe(true);
});
