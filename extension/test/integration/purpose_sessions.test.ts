import { expect, it, vi } from 'vitest';
import { purposeSessionsFixture as fixture } from '../fixtures/purpose_sessions.ts';
import { NamedSessions, NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { PurposeIdentityVerifier } from '../../src/application/purpose_identity_verifier.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { decodeConnections } from '../../src/domain/named_sessions.ts';
import { purposeEntry } from '../fixtures/credential_roles.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';

it.each(['issues-write', 'actions-write'] as const)('adding %s stores a separate identity without changing active read credentials, epoch or repository opt-in', async purpose => {
    const h = fixture(); await h.addRead(); const active = structuredClone(h.values.get(SESSION_KEY)); const epoch = h.service.status().epoch; h.resetCalls();
    const result = await h.add(purpose, 1); expect(result).toMatchObject({ state: 'ready', revision: 2, selected: 'session-1', connected: true,
        optionalWrites: { 'issues-write': { state: 'disabled', selected: null }, 'actions-write': { state: 'disabled', selected: null } } });
    expect(decodeConnections(result)).toEqual(result); expect(h.values.get(SESSION_KEY)).toEqual(active); expect(h.service.status()).toEqual({ state: 'connected', epoch });
    expect(h.namedPorts.connected).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled(); expect(h.writes()).toHaveLength(1); expect(h.reader.read).toHaveBeenCalledTimes(2);
    expect(h.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ schemaVersion: 2, selected: 'session-1', entries: [{ role: 'repository-read' }, { role: purpose }] });
    expect(JSON.stringify(result)).not.toContain(h.adding(purpose).secret); expect(h.namedPorts.changed).toHaveBeenCalledTimes(2);
});
it('an optional identity can be saved while the read service stays disconnected and no read credential is ever created', async () => {
    const h = fixture(); expect(await h.add('issues-write', 0)).toMatchObject({ state: 'ready', selected: null, connected: false, revision: 1 });
    expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.service.status().state).toBe('disconnected'); expect(h.namedPorts.connected).not.toHaveBeenCalled();
});
it.each(['issues-write', 'actions-write'] as const)('explicit %s selection verifies its own identity and leaves the independent read slot intact', async purpose => {
    const h = fixture(); await h.addRead(); await h.add(purpose, 1); const active = structuredClone(h.values.get(SESSION_KEY)); const epoch = h.service.status().epoch; h.resetCalls();
    const selected = await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current);
    expect(selected).toMatchObject({ state: 'ready', selected: 'session-1', optionalWrites: { [purpose]: { state: 'identity-verified', selected: 'session-2' } } });
    expect(h.values.get(SESSION_KEY)).toEqual(active); expect(h.service.status().epoch).toBe(epoch); expect(h.namedPorts.connected).not.toHaveBeenCalled();
    expect(h.reader.read).toHaveBeenCalledTimes(2); expect(h.writes()).toHaveLength(1); expect(await h.read()).toEqual(selected);
});
it('selecting another purpose preserves the previous slot but retires its prior private verification evidence', async () => {
    const h = fixture(); await h.add('issues-write', 0); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current);
    await h.add('actions-write', 2); const result = await h.connections.change({ type: 'select', id: 'session-2' }, 3, h.current);
    expect(result).toMatchObject({ optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-1' }, 'actions-write': { state: 'identity-verified', selected: 'session-2' } } });
});
it('a cold named owner retains the native optional selection as stored and cannot inherit another worker’s identity proof', async () => {
    const h = fixture(); await h.add('issues-write', 0); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current);
    const cold = new NamedSessions(h.port, h.service, h.namedPorts, new PurposeIdentityVerifier(h.scheduler, h.ports)); h.resetCalls();
    expect(await cold.read(h.current)).toMatchObject({ optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-1' } } }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a changed read credential epoch invalidates optional identity proof even when the vault payload remains the same', async () => {
    const h = fixture(); await h.add('issues-write', 0); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current); await h.service.revoke();
    expect(await h.read()).toMatchObject({ optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-1' } } });
});
it('an externally changed vault cannot preserve the old worker’s optional identity proof', async () => {
    const h = fixture(); await h.add('issues-write', 0); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current);
    const value = h.values.get(NAMED_SESSIONS_KEY) as Record<string, unknown>; h.values.set(NAMED_SESSIONS_KEY, { ...value, revision: 3 });
    expect(await h.read()).toMatchObject({ optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-1' } } });
});
it.each(['issues-write', 'actions-write'] as const)('disabling %s removes only its selection without deleting credentials or changing the active read service', async purpose => {
    const h = fixture(); await h.addRead(); await h.add(purpose, 1); await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current); h.resetCalls();
    const active = structuredClone(h.values.get(SESSION_KEY)); const result = await h.connections.change({ type: 'disable-role', purpose }, 3, h.current);
    expect(result).toMatchObject({ revision: 4, selected: 'session-1', optionalWrites: { [purpose]: { state: 'disabled', selected: null } }, entries: expect.any(Array) });
    if (result.state !== 'ready') throw new Error('invalid-fixture'); expect(result.entries).toHaveLength(2); expect(h.values.get(SESSION_KEY)).toEqual(active);
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled(); expect(h.namedPorts.connected).not.toHaveBeenCalled();
});
it('disabling an already disabled role is a no-effect inspection and does not upgrade the legacy read vault', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); expect(await h.connections.change({ type: 'disable-role', purpose: 'issues-write' }, 1, h.current)).toMatchObject({ revision: 1 });
    expect(h.values.get(NAMED_SESSIONS_KEY)).toMatchObject({ schemaVersion: 1 }); expect(h.port.set).not.toHaveBeenCalled(); expect(h.namedPorts.changed).not.toHaveBeenCalled();
});
it('removing a selected optional identity clears only that slot, preserving the read credential and other roles', async () => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); await h.add('actions-write', 2); await h.connections.change({ type: 'select', id: 'session-2' }, 3, h.current);
    const active = structuredClone(h.values.get(SESSION_KEY)); h.resetCalls(); const result = await h.connections.change({ type: 'remove', id: 'session-2' }, 4, h.current);
    expect(result).toMatchObject({ selected: 'session-1', optionalWrites: { 'issues-write': { state: 'disabled' } }, entries: [{ id: 'session-1' }, { id: 'session-3' }] });
    expect(h.values.get(SESSION_KEY)).toEqual(active); expect(h.port.remove).not.toHaveBeenCalled();
});
it('disconnecting a read identity does not remove or silently disable separately selected optional identities', async () => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current);
    const result = await h.connections.change({ type: 'disconnect' }, 3, h.current); expect(result).toMatchObject({ selected: null, connected: false,
        optionalWrites: { 'issues-write': { state: 'stored', selected: 'session-2' } }, entries: [{ id: 'session-2' }] }); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('global capacity includes every purpose and rejects a sixth session before identity verification', async () => {
    const h = fixture(); await h.addRead(); for (let revision = 1; revision < 5; revision++) await h.add('issues-write', revision, `Issues ${revision}`);
    h.resetCalls(); expect(await h.add('actions-write', 5)).toEqual({ state: 'capacity' }); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('a unique credential purpose cannot borrow an existing token from the read session even when names differ', async () => {
    const h = fixture(); const secret = purposeEntry('issues-write').connection.secret; await h.connections.change({ ...CONNECTION_INPUT, secret }, 0, h.current); h.resetCalls();
    expect(await h.connections.change({ ...h.adding('issues-write'), secret }, 1, h.current)).toEqual({ state: 'invalid' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('an optional token cannot be reused by a read connection or the other optional purpose', async () => {
    const h = fixture(); await h.add('issues-write', 0); h.resetCalls(); const secret = h.adding('issues-write').secret;
    expect(await h.connections.change({ ...CONNECTION_INPUT, secret }, 1, h.current)).toEqual({ state: 'invalid' });
    expect(await h.connections.change({ ...h.adding('actions-write'), secret }, 1, h.current)).toEqual({ state: 'invalid' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('local names remain unique across read and optional purposes', async () => {
    const h = fixture(); await h.addRead(); h.resetCalls(); expect(await h.add('issues-write', 1, 'work')).toEqual({ state: 'invalid' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a composition without the optional verifier fails closed without reading, activating or silently promoting any role', async () => {
    const h = fixture(); const legacy = new NamedSessions(h.port, h.service, h.namedPorts); h.resetCalls();
    expect(await legacy.change(h.adding('issues-write'), 0, h.current)).toEqual({ state: 'unavailable' }); expect(h.port.get).not.toHaveBeenCalled();
    await h.add('issues-write', 0); expect(await legacy.read(h.current)).toEqual({ state: 'unavailable' });
    expect(await legacy.change({ type: 'select', id: 'session-1' }, 1, h.current)).toEqual({ state: 'unavailable' });
});
it('explicit forgetting removes all purposes and active read credentials without resetting authored settings', async () => {
    const h = fixture(); await h.addRead(); await h.add('issues-write', 1); h.values.set('authored-preferences', { locale: 'es' }); await h.connections.revokeAll();
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.values.get('authored-preferences')).toEqual({ locale: 'es' });
    expect(await h.read()).toMatchObject({ state: 'ready', selected: null, entries: [] });
});
it('an optional account may differ from the read account without replacing or relabeling the active read identity', async () => {
    const h = fixture(); await h.addRead(); const active = structuredClone(h.values.get(SESSION_KEY)); h.resetCalls();
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', bytes: 100, etag: '"other-account"', data: request.type === 'viewer' ? { id: '2', login: 'other' } : { id: '7', name: 'octo/example' } }));
    await h.add('issues-write', 1); const result = await h.connections.change({ type: 'select', id: 'session-2' }, 2, h.current);
    expect(result).toMatchObject({ selected: 'session-1', connected: true, entries: [{ viewerId: '1', viewerLogin: 'octo' }, { viewerId: '2', viewerLogin: 'other' }],
        optionalWrites: { 'issues-write': { state: 'identity-verified', selected: 'session-2' } } }); expect(h.values.get(SESSION_KEY)).toEqual(active);
});
it('an invalid canonical read identity cannot become a named native successor and its provisional read credential is retired', async () => {
    const h = fixture(); vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', bytes: 10, etag: '',
        data: request.type === 'viewer' ? { id: '1', login: 'invalid account' } : { id: '7', name: 'octo/example' } }));
    expect(await h.addRead()).toEqual({ state: 'unavailable' }); expect(h.writes()).toHaveLength(0); expect(h.values.has(SESSION_KEY)).toBe(false);
    expect(h.service.status().state).toBe('unavailable');
});
