import { expect, it } from 'vitest';
import { connectionIntent, connectionsView, decodeConnections, sameSessionVault, validVault } from '../../src/domain/named_sessions.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';
import { purposeVault, purposeEntry } from '../fixtures/credential_roles.ts';

const intent = () => ({ type: 'connect-role', purpose: 'issues-write', name: 'Issue triage', secret: purposeEntry('issues-write').connection.secret, repository: 'octo/example' });
const message = (value: unknown) => ({ version: 1, method: 'center.connections.change', clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2, expectedRevision: 4, intent: value });
it('new optional connections use their own exact intent and cannot promote an existing read intent by adding role fields', () => {
    expect(connectionIntent(intent())).toBe(true); expect(parseCenterMessage(message(intent()))).not.toBeNull();
    expect(connectionIntent({ ...intent(), type: 'connect' })).toBe(false);
    expect(connectionIntent({ type: 'connect', name: 'Read', secret: intent().secret, repository: 'octo/example', role: 'issues-write' })).toBe(false);
});
it.each(['issues-write', 'actions-write'] as const)('the %s slot can be disabled through only its closed purpose intent', purpose => {
    const value = { type: 'disable-role', purpose }; expect(connectionIntent(value)).toBe(true); expect(parseCenterMessage(message(value))).not.toBeNull();
});
it.each([
    ['unsupported setup purpose', { ...intent(), purpose: 'setup' }], ['read purpose in optional intent', { ...intent(), purpose: 'repository-read' }],
    ['broad classic credential', { ...intent(), secret: 'ghp_synthetic_classic' }], ['provider credential', { ...intent(), secret: 'sk_synthetic_provider' }],
    ['missing purpose', { ...intent(), purpose: undefined }], ['unknown permission grant', { ...intent(), writeAllowed: true }],
    ['arbitrary endpoint', { ...intent(), url: 'https://elsewhere.test' }], ['changed host', { ...intent(), host: 'elsewhere.test' }],
    ['malformed repository', { ...intent(), repository: '../repo' }], ['invalid label', { ...intent(), name: ' bad' }],
    ['generic role selection', { type: 'select', id: 'issues', purpose: 'actions-write' }],
    ['disable with token', { type: 'disable-role', purpose: 'issues-write', secret: intent().secret }],
    ['disable with read purpose', { type: 'disable-role', purpose: 'repository-read' }], ['disable without purpose', { type: 'disable-role' }],
])('a %s cannot enter the actual native connection message contract', (_name, value) => {
    expect(connectionIntent(value)).toBe(false); expect(parseCenterMessage(message(value))).toBeNull();
});
it('the common connection projection exposes separate optional identities and never their protected credential payloads', () => {
    const vault = purposeVault(); const view = connectionsView(vault, true, 9, ['issues-write', 'actions-write']);
    expect(view.optionalWrites).toEqual({ 'issues-write': { state: 'identity-verified', selected: 'issues' }, 'actions-write': { state: 'disabled', selected: null } });
    expect(view.selected).toBe('read'); expect(view.entries.map(entry => entry.role)).toEqual(['repository-read', 'issues-write', 'actions-write']);
    expect(validVault(vault)).toBe(true); expect(sameSessionVault(vault, purposeVault())).toBe(true); expect(decodeConnections(view)).toEqual(view);
    for (const entry of vault.entries) expect(JSON.stringify(view)).not.toContain(entry.connection.secret);
    expect(JSON.stringify(view)).not.toContain('connection'); expect(JSON.stringify(view)).not.toContain('writeAllowed');
});
it('a cold purpose-aware projection labels retained selections stored rather than fabricating a hot identity or write grant', () => {
    const value = connectionsView(purposeVault(), false); expect(value.optionalWrites?.['issues-write']).toEqual({ state: 'stored', selected: 'issues' });
    expect(decodeConnections(value)).toEqual(value); expect(Object.isFrozen(value.optionalWrites?.['issues-write'])).toBe(true);
});
it.each(['missing-optional-view', 'writer-in-read-slot', 'wrong-optional-slot', 'unknown-grant', 'private-entry-secret', 'private-slot-token', 'unknown-entry-role'] as const)('the %s public connection DTO cannot conflate identity, purpose or grant', kind => {
    const value = structuredClone(connectionsView(purposeVault(), true)) as unknown as Record<string, unknown>;
    if (kind === 'missing-optional-view') delete value.optionalWrites;
    if (kind === 'writer-in-read-slot') value.selected = 'issues';
    if (kind === 'wrong-optional-slot') value.optionalWrites = { 'issues-write': { state: 'stored', selected: 'actions' }, 'actions-write': { state: 'disabled', selected: null } };
    if (kind === 'unknown-grant') value.writeAllowed = true;
    if (kind === 'private-entry-secret') (value.entries as Record<string, unknown>[])[1].secret = intent().secret;
    if (kind === 'private-slot-token') value.optionalWrites = { 'issues-write': { state: 'stored', selected: 'issues', token: intent().secret }, 'actions-write': { state: 'disabled', selected: null } };
    if (kind === 'unknown-entry-role') (value.entries as Record<string, unknown>[])[1].role = 'setup';
    expect(decodeConnections(value)).toBeNull();
});
it('decoding detached optional metadata cannot freeze or retain references to the native caller’s mutable object', () => {
    const original = structuredClone(connectionsView(purposeVault(), true)); const decoded = decodeConnections(original);
    expect(decoded).toEqual(original); expect(Object.isFrozen(original.optionalWrites)).toBe(false);
    if (decoded?.state !== 'ready') throw new Error('invalid-fixture'); expect(decoded.optionalWrites).not.toBe(original.optionalWrites);
    expect(Object.isFrozen(decoded.optionalWrites?.['issues-write'])).toBe(true);
});
