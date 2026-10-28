import { expect, it, vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CENTER_SENDER as sender, centerFixture } from '../fixtures/center.ts';
import { deferred, sessionHarness } from '../fixtures/runtime.ts';

const intent = { type: 'preferences', values: { density: 'compact' } };
function fixture(withCenter = true) {
    const h = centerFixture(); const sessions = sessionHarness();
    const gateway = new MessageGateway('test', 'chrome-extension://test/', h.repository, sessions.service,
        { currentTab: vi.fn(), openSettings: vi.fn(), cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() }, withCenter ? h.gateway : undefined);
    return { ...h, sessions, call: (value: unknown, source = sender) => gateway.handle({ version: 1, ...value as object }, source), main: gateway };
}
it('routes admitted native center requests through the real gateway and saves only a retained preview', async () => {
    const h = fixture(); const client = h.open(); const editor = { clientId: client.clientId, controllerEpoch: client.controllerEpoch };
    expect(await h.call({ method: 'center.open' })).toEqual(client); expect(h.port.get).not.toHaveBeenCalled();
    expect(await h.call({ method: 'center.read', clientId: client.clientId })).toMatchObject({ role: 'editor', loaded: { state: 'ready' }, rollbackAvailable: false });
    const preview = await h.call({ method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, ...editor, intent }) as { state: string; operationId: string; revision: number };
    expect(preview.state).toBe('preview'); expect(h.port.set).not.toHaveBeenCalled();
    const confirmation = { method: 'center.confirm', credentialEpoch: 0, ...editor, operationId: preview.operationId, expectedRevision: preview.revision };
    expect(await h.call(confirmation)).toMatchObject({ state: 'committed', revision: 1, current: true });
    expect(await h.call(confirmation)).toMatchObject({ state: 'committed', revision: 1 });
    expect(h.port.set).toHaveBeenCalledTimes(1);
    expect(await h.call({ method: 'center.read', clientId: client.clientId })).toMatchObject({ rollbackAvailable: true,
        lastOperation: { id: preview.operationId, beforeRevision: 0 }, loaded: { settings: { density: 'compact', revision: 1 } } });
    expect(h.sessions.reader.read).not.toHaveBeenCalled();
});
it('refuses content pages, foreign native origins, malformed operands and unbound client documents before storage', async () => {
    const h = fixture(); const client = h.open();
    const request = { method: 'center.read', clientId: client.clientId };
    for (const source of [{ ...sender, id: 'foreign' }, { ...sender, url: 'https://github.com/octo/example' },
        { ...sender, url: 'chrome-extension://test/runtime.html?private' }, { ...sender, tab: { id: 1, incognito: true } }]) {
        expect(await h.call(request, source)).toEqual({ state: 'rejected' });
    }
    expect(await h.call(request, { ...sender, documentId: 'another' })).toEqual({ state: 'stale' });
    expect(await h.call(request, { ...sender, documentId: '' })).toEqual({ state: 'rejected' });
    expect(await h.call({ ...request, extra: true })).toEqual({ state: 'rejected' });
    const withoutCenter = new MessageGateway('test', 'chrome-extension://test/', h.repository, h.sessions.service,
        { currentTab: vi.fn(), openSettings: vi.fn(), cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() });
    expect(await withoutCenter.handle({ version: 1, method: 'center.open' }, sender)).toEqual({ state: 'rejected' });
    withoutCenter.releaseCenterTab(1); withoutCenter.shutdown(); expect(h.port.get).not.toHaveBeenCalled();
});
it('observers cannot mutate; explicit takeover invalidates old previews and stale ownership cannot be reused', async () => {
    const h = fixture(); const editor = h.open(); const observerSource = { ...sender, documentId: 'two', tab: { id: 2, incognito: false } };
    const observer = h.open({ documentId: 'two', tabId: 2 });
    const preview = await h.operations.preview(intent, editor.clientId);
    if (preview.state !== 'preview') throw new Error('expected preview');
    const observerArgs = { clientId: observer.clientId, controllerEpoch: observer.controllerEpoch };
    for (const request of [{ method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, intent }, ...['center.confirm', 'center.cancel'].map(method =>
        ({ method, credentialEpoch: 0, operationId: preview.operationId, expectedRevision: 0 }))]) {
        expect(await h.call({ ...observerArgs, ...request }, observerSource)).toEqual({ state: 'denied' });
    }
    expect(await h.call({ ...observerArgs, method: 'center.claim' }, observerSource)).toMatchObject({ role: 'editor', controllerEpoch: 2 });
    expect(await h.call({ method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, clientId: editor.clientId, controllerEpoch: 1, intent })).toEqual({ state: 'stale' });
    expect(await h.call({ ...observerArgs, controllerEpoch: 2, method: 'center.confirm', credentialEpoch: 0, operationId: preview.operationId, expectedRevision: 0 }, observerSource)).toEqual({ state: 'expired' });
    expect(await h.call({ ...observerArgs, controllerEpoch: 2, method: 'center.close' }, observerSource)).toEqual({ state: 'closed' });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('cancel and native tab release retire previews without claiming a saved effect', async () => {
    const h = fixture(); const client = h.open();
    const preview = await h.operations.preview(intent, client.clientId); if (preview.state !== 'preview') throw new Error('expected preview');
    expect(await h.call({ method: 'center.cancel', credentialEpoch: 0, clientId: client.clientId, controllerEpoch: 1, operationId: preview.operationId, expectedRevision: 0 })).toEqual({ state: 'cancelled' });
    h.main.releaseCenterTab(1);
    expect(await h.call({ method: 'center.read', clientId: client.clientId })).toEqual({ state: 'stale' });
    h.open(); h.main.shutdown(); expect(h.controller.fence(client.clientId)).toBe(null); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['takeover', 'credential', 'shutdown'])('a %s during a settings read prevents publication into the old client context', async transition => {
    const h = fixture(); const client = h.open(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const reading = h.call({ method: 'center.read', clientId: client.clientId });
    if (transition === 'takeover') { const binding = { documentId: 'two', tabId: 2 }; const other = h.open(binding); h.controller.claim(other.clientId, binding, other.controllerEpoch); }
    else if (transition === 'credential') h.disconnect(); else h.gateway.shutdown();
    pending.resolve(undefined); expect(await reading).toEqual({ state: 'stale' });
});
it('migrates only at explicit center startup and keeps future data inert, with sanitized failures', async () => {
    const h = fixture(); const client = h.open(); const request = { method: 'center.read', clientId: client.clientId };
    h.values.set(SETTINGS_KEY, { schemaVersion: 0, compact: true });
    expect(await h.call(request)).toMatchObject({ loaded: { settings: { schemaVersion: 2, density: 'compact' } }, rollbackAvailable: true });
    h.values.set(SETTINGS_KEY, { current: { schemaVersion: 99 }, previous: DEFAULT_SETTINGS });
    expect(await h.call(request)).toMatchObject({ loaded: { state: 'future' }, rollbackAvailable: false });
    const writes = vi.mocked(h.port.set).mock.calls.length;
    vi.mocked(h.port.get).mockRejectedValueOnce(new Error('private provider payload'));
    expect(await h.call(request)).toEqual({ state: 'unavailable' }); expect(h.port.set).toHaveBeenCalledTimes(writes);
});
it('an overlarge or unserializable internal preview fails at the bounded response boundary', async () => {
    const h = fixture(); const client = h.open(); const request = { method: 'center.preview', credentialEpoch: 0, expectedRevision: 0, clientId: client.clientId, controllerEpoch: 1, intent };
    vi.spyOn(h.operations, 'preview').mockResolvedValueOnce({ state: 'preview', after: 'x'.repeat(133 * 1024) } as never);
    expect(await h.call(request)).toEqual({ state: 'unavailable' });
    vi.spyOn(h.operations, 'preview').mockRejectedValueOnce(new Error('private provider payload'));
    expect(await h.call(request)).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('center composition rejects every direct legacy settings write while standalone H2 retains its original revision-bound preferences', async () => {
    const h = fixture();
    expect(await h.call({ method: 'settings.write', expectedRevision: 0, settings: { ...DEFAULT_SETTINGS,
        center: { ...DEFAULT_SETTINGS.center, favorites: ['BEX-CENTER-01'] } } })).toEqual({ state: 'rejected' });
    expect(await h.call({ method: 'settings.write', expectedRevision: 0, settings: null })).toEqual({ state: 'rejected' });
    expect(await h.call({ method: 'settings.write', expectedRevision: 0, settings: { ...DEFAULT_SETTINGS, paused: true } })).toEqual({ state: 'rejected' });
    expect(h.port.set).not.toHaveBeenCalled();
    const legacy = fixture(false);
    expect(await legacy.call({ method: 'settings.write', expectedRevision: 0, settings: { ...DEFAULT_SETTINGS, paused: true } })).toMatchObject({ state: 'ready' });
    expect(await legacy.call({ method: 'settings.write', expectedRevision: 0, settings: DEFAULT_SETTINGS })).toEqual({ state: 'unavailable' });
    expect(legacy.port.set).toHaveBeenCalledTimes(1);
});
