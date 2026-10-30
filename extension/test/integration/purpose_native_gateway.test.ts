import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { pageSender } from '../fixtures/page_configuration.ts';
import { purposeEntry } from '../fixtures/credential_roles.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/native_session_vault.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { decodeConnections } from '../../src/domain/named_sessions.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() {
    const h = backgroundCenterFixture(); stops.push(h.stop); const client = await h.client(); await client.connections(CONNECTION_INPUT, 0);
    const owner = await h.call({ version: 1, method: 'center.open' }); const entry = purposeEntry('issues-write');
    const intent = { type: 'connect-role', purpose: 'issues-write', name: 'Issue triage', repository: 'octo/example', secret: entry.connection.secret } as const;
    const base = { version: 1, method: 'center.connections.change', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch, expectedRevision: 1 };
    h.provider.mockClear(); vi.mocked(h.sessionArea.get).mockClear(); vi.mocked(h.sessionArea.set).mockClear(); vi.mocked(h.localArea.set).mockClear();
    return { ...h, client, owner, intent, base, change: { ...base, intent }, reset: () => { h.provider.mockClear(); vi.mocked(h.sessionArea.get).mockClear(); vi.mocked(h.sessionArea.set).mockClear(); vi.mocked(h.localArea.set).mockClear(); } };
}
it('actual native message/background/GET/vault composition saves an optional role without changing read credentials or authored settings', async () => {
    const h = await fixture(); const read = structuredClone(h.sessionValues.get(SESSION_KEY)); const settings = structuredClone(h.localValues.get(SETTINGS_KEY));
    const result = await h.call(h.change); const { sourceTree: _source, ...payload } = result;
    expect(decodeConnections(payload)).toMatchObject({ state: 'ready', connected: true, revision: 2, optionalWrites: { 'issues-write': { state: 'disabled' } } });
    expect(h.sessionValues.get(SESSION_KEY)).toEqual(read); expect(h.localValues.get(SETTINGS_KEY)).toEqual(settings); expect(h.localArea.set).not.toHaveBeenCalled();
    expect(h.provider).toHaveBeenCalledTimes(2); expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
    expect(vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, NAMED_SESSIONS_KEY))).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(h.intent.secret); expect(JSON.stringify(result)).not.toContain(CONNECTION_INPUT.secret);
});
it('actual optional create observations show only their native vault effect, with no invented active-read or preference write', async () => {
    const h = await fixture(); await h.call(h.change); const raw = await h.call({ version: 1, method: 'center.operation.read', clientId: h.owner.clientId });
    const { sourceTree: _tree, ...payload } = raw; const value = decodeCurrentOperation(payload);
    expect(value).toMatchObject({ state: 'current', operation: { family: 'sessions', fact: { action: 'connect-role', result: 'ready',
        effects: [{ effect: 'save-vault', acknowledgement: 'accepted', observation: 'committed' }] } } });
    expect(JSON.stringify(raw)).not.toContain(h.intent.secret); expect(JSON.stringify(raw)).not.toContain(CONNECTION_INPUT.secret);
});
it('the actual native controller selects and disables the writer independently while preserving the read credential and settings', async () => {
    const h = await fixture(); await h.call(h.change); const view = await h.call({ version: 1, method: 'center.connections.read', clientId: h.owner.clientId });
    const entries = view.entries as { id: string; role: string }[]; const id = entries.find(entry => entry.role === 'issues-write')!.id; const read = structuredClone(h.sessionValues.get(SESSION_KEY));
    expect(await h.call({ ...h.base, expectedRevision: 2, intent: { type: 'select', id } })).toMatchObject({ state: 'ready', optionalWrites: { 'issues-write': { state: 'identity-verified', selected: id } } });
    h.reset(); expect(await h.call({ ...h.base, expectedRevision: 3, intent: { type: 'disable-role', purpose: 'issues-write' } })).toMatchObject({ state: 'ready', optionalWrites: { 'issues-write': { state: 'disabled' } } });
    expect(h.sessionValues.get(SESSION_KEY)).toEqual(read); expect(h.provider).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled();
});
it('the complete private CenterClient can receive optional role views with the same source identity and cannot invent its own grant', async () => {
    const h = await fixture(); expect(await h.client.connections(h.intent, 1)).toBe(2); await h.client.connections();
    expect(h.client.view.connections).toMatchObject({ state: 'ready', revision: 2, optionalWrites: { 'issues-write': { state: 'disabled', selected: null } } });
    expect(h.client.view.issue).toBeNull();
});
it.each(['content', 'foreign-origin', 'wrong-extension', 'private-tab'] as const)('a %s caller cannot reach optional credential or vault work through the native message family', async kind => {
    const h = await fixture(); const sender = kind === 'content' ? pageSender : { ...h.sender,
        ...(kind === 'foreign-origin' ? { url: 'https://elsewhere.test/runtime.html' } : kind === 'wrong-extension' ? { id: 'elsewhere' } : { tab: { id: 1, incognito: true } }) };
    expect(await h.call(h.change, sender)).toMatchObject({ state: 'rejected' }); expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('a real observer can inspect optional metadata but cannot create, select or disable a credential purpose', async () => {
    const h = await fixture(); const source = { ...h.sender, documentId: 'observer-document', tab: { id: 2, incognito: false } }; const observer = await h.call({ version: 1, method: 'center.open' }, source);
    expect(observer.role).toBe('observer'); h.reset();
    for (const intent of [h.intent, { type: 'select', id: 'missing' }, { type: 'disable-role', purpose: 'issues-write' }])
        expect(await h.call({ ...h.base, clientId: observer.clientId, controllerEpoch: observer.controllerEpoch, credentialEpoch: observer.credentialEpoch, intent }, source)).toMatchObject({ state: 'denied' });
    expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it.each(['credential-epoch', 'controller-epoch', 'document-binding'] as const)('stale %s authority cannot access optional identities before native admission', async kind => {
    const h = await fixture(); const value = { ...h.change, ...(kind === 'credential-epoch' ? { credentialEpoch: Number(h.owner.credentialEpoch) + 1 }
        : kind === 'controller-epoch' ? { controllerEpoch: Number(h.owner.controllerEpoch) + 1 } : {}) };
    const source = kind === 'document-binding' ? { ...h.sender, documentId: 'retired-document' } : h.sender;
    expect(await h.call(value, source)).toMatchObject({ state: 'stale' }); expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it.each(['role-promotion', 'arbitrary-endpoint', 'setup-purpose', 'unknown-grant', 'oversized'] as const)('a malformed %s payload is rejected by the actual native parser before storage or provider calls', async kind => {
    const h = await fixture(); const intent = { ...h.intent, ...(kind === 'role-promotion' ? { type: 'connect' } : kind === 'arbitrary-endpoint' ? { url: 'https://elsewhere.test' }
        : kind === 'setup-purpose' ? { purpose: 'setup' } : kind === 'unknown-grant' ? { granted: true } : { name: 'x'.repeat(8193) }) };
    expect(await h.call({ ...h.change, intent })).toMatchObject({ state: 'rejected' }); expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('a legacy native raw-connect message cannot bypass the installed role manager or create active read authority', async () => {
    const h = await fixture(); expect(await h.call({ version: 1, method: 'session.connect', secret: h.intent.secret, repository: 'octo/example' })).toMatchObject({ state: 'rejected' });
    expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('protected storage unavailability cannot downgrade optional roles to persistent local storage', async () => {
    const h = await fixture(); vi.mocked(h.sessionArea.setAccessLevel!).mockRejectedValueOnce(new Error('private native protection failure'));
    expect(await h.call(h.change)).toMatchObject({ state: 'unavailable' }); expect(h.provider).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled();
});
it.each(['negative-revision', 'invalid-client-id', 'non-numeric-credential', 'negative-controller', 'unknown-method', 'extra-top-level', 'null-intent', 'bulk-intent', 'secret-on-selection'] as const)('the actual %s wire boundary rejects before any protected lookup', async kind => {
    const h = await fixture(); const value = { ...h.change,
        ...(kind === 'negative-revision' ? { expectedRevision: -1 } : kind === 'invalid-client-id' ? { clientId: 'not-an-authority-id' }
            : kind === 'non-numeric-credential' ? { credentialEpoch: '2' } : kind === 'negative-controller' ? { controllerEpoch: -1 }
                : kind === 'unknown-method' ? { method: 'center.connections.execute' } : kind === 'extra-top-level' ? { approved: true }
                    : { intent: kind === 'null-intent' ? null : kind === 'bulk-intent' ? [h.intent, h.intent] : { type: 'select', id: 'missing', secret: h.intent.secret } }) };
    expect(await h.call(value)).toMatchObject({ state: 'rejected' }); expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('a valid legacy raw-settings request cannot import optional credentials around the installed native controller', async () => {
    const h = await fixture(); expect(await h.call({ version: 1, method: 'settings.write', settings: DEFAULT_SETTINGS, expectedRevision: 1 })).toMatchObject({ state: 'rejected' });
    expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled();
});
it('withdrawn GitHub API permission leaves optional identity unavailable without restoring or changing the active read credential', async () => {
    const h = await fixture(); const active = structuredClone(h.sessionValues.get(SESSION_KEY)); vi.mocked(h.api.permissions.contains).mockResolvedValue(false);
    expect(await h.call(h.change)).toMatchObject({ state: 'unavailable' }); expect(h.provider).not.toHaveBeenCalled(); expect(h.sessionValues.get(SESSION_KEY)).toEqual(active);
    expect(vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, NAMED_SESSIONS_KEY))).toHaveLength(0);
});
