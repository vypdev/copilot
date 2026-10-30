import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { pageSender } from '../fixtures/page_configuration.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() {
    const h = backgroundCenterFixture(); stops.push(h.stop); const client = await h.client(); await client.connections(CONNECTION_INPUT, 0);
    const owner = await h.call({ version: 1, method: 'center.open' }); h.provider.mockClear(); vi.mocked(h.sessionArea.get).mockClear(); vi.mocked(h.sessionArea.set).mockClear();
    const read = { version: 1, method: 'center.session-preferences.read', clientId: owner.clientId };
    const base = { version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch, expectedRevision: 0 };
    const preview = { ...base, method: 'center.session-preferences.preview', intent: { type: 'replace', preferences: { density: 'compact', paused: true } } };
    return { ...h, owner, read, base, preview };
}
it('actual background/center/private source/store composition completes one inferred-scope review with redacted native facts and no extra provider call', async () => {
    const h = await fixture(); expect(await h.call(h.read)).toMatchObject({ state: 'ready', loaded: { state: 'ready', value: { scope: null } }, source: { state: 'ready', context: { verified: true } } });
    const preview = await h.call(h.preview); expect(preview).toMatchObject({ state: 'preview', source: { name: 'Work' }, after: { preferences: { density: 'compact', paused: true } } });
    const confirm = { ...h.base, method: 'center.session-preferences.confirm', operationId: preview.operationId };
    const result = await h.call(confirm); expect(result).toMatchObject({ state: 'result', outcome: { state: 'committed', revision: 1, current: true }, facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: 'committed' } });
    expect(await h.call(confirm)).toEqual(result); expect(await h.call(h.read)).toMatchObject({ state: 'ready', loaded: { state: 'ready', value: { revision: 1 } }, effective: { density: 'compact', paused: true }, restriction: { paused: true, reason: 'session' } });
    expect(h.provider).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain(CONNECTION_INPUT.secret);
    expect(vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, SESSION_PREFERENCES_KEY))).toHaveLength(1);
});
it('a GitHub content sender cannot read native selectors or request any session preference review before storage access', async () => {
    const h = await fixture(); vi.mocked(h.localArea.get).mockClear();
    for (const value of [h.read, h.preview, { ...h.base, method: 'center.session-preferences.confirm', operationId: 'c'.repeat(32) }]) expect(await h.call(value, pageSender)).toMatchObject({ state: 'rejected' });
    expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.localArea.get).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('a real observer can inspect native current data but cannot review or confirm another native window operation', async () => {
    const h = await fixture(); const sender = { ...h.sender, documentId: 'observer', tab: { id: 2, incognito: false } };
    const observer = await h.call({ version: 1, method: 'center.open' }, sender); expect(observer.role).toBe('observer');
    expect(await h.call({ ...h.read, clientId: observer.clientId }, sender)).toMatchObject({ state: 'ready' });
    const preview = await h.call(h.preview); expect(preview.state).toBe('preview');
    const base = { ...h.base, clientId: observer.clientId, controllerEpoch: observer.controllerEpoch, credentialEpoch: observer.credentialEpoch };
    expect(await h.call({ ...h.preview, ...base }, sender)).toMatchObject({ state: 'denied' });
    expect(await h.call({ ...base, method: 'center.session-preferences.confirm', operationId: preview.operationId }, sender)).toMatchObject({ state: 'denied' }); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('a stale native credential epoch and a vault event invalidate review authority without an actual preference write', async () => {
    const h = await fixture(); expect(await h.call({ ...h.preview, credentialEpoch: -1 })).toMatchObject({ state: 'rejected' });
    expect(await h.call({ ...h.preview, credentialEpoch: Number(h.owner.credentialEpoch) + 1 })).toMatchObject({ state: 'stale' });
    const preview = await h.call(h.preview); expect(preview.state).toBe('preview');
    for (const listener of h.changed.listeners) listener({ 'copilot.named-sessions.v1': {} }, 'session');
    expect(await h.call({ ...h.base, method: 'center.session-preferences.confirm', operationId: preview.operationId })).toMatchObject({ state: 'expired' }); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('a trusted native preference storage event invalidates consumers without inspecting credentials or inventing a write', async () => {
    const h = await fixture(); vi.mocked(h.api.runtime.sendMessage).mockClear(); vi.mocked(h.sessionArea.get).mockClear();
    for (const listener of h.changed.listeners) listener({ [SESSION_PREFERENCES_KEY]: {} }, 'local'); expect(h.api.runtime.sendMessage).not.toHaveBeenCalled();
    for (const listener of h.changed.listeners) listener({ [SESSION_PREFERENCES_KEY]: {} }, 'session');
    expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.invalidated' }); expect(h.sessionArea.get).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
