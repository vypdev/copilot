import { expect, it, vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { memoryStore, sessionHarness, CONNECTED, PAGE, deferred } from '../fixtures/runtime.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

const origin = 'chrome-extension://test/';
const extension = { id: 'test', url: `${origin}runtime.html` };
const sender = { id: 'test', url: PAGE.route, frameId: 0, tab: { id: 1, url: PAGE.route, incognito: false } };
function harness() {
    const h = sessionHarness(); const local = memoryStore(); const settings = new SettingsRepository(local.port);
    const ports = { currentTab: vi.fn(async (): Promise<{ url: string; incognito: boolean; active: boolean }> => ({ url: PAGE.route, incognito: false, active: true })),
        cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() };
    const gateway = new MessageGateway('test', origin, settings, h.service, ports);
    const connect = () => gateway.handle({ version: 1, method: 'session.connect', secret: CONNECTED.secret, repository: CONNECTED.repository }, extension);
    return { ...h, local, settings, ports, gateway, connect };
}
it('github-browser-extension-runtime-C25/github-browser-extension-runtime-C26 rejects malformed/foreign/incognito messages before storage, reader or secret operations', async () => {
    const h = harness();
    for (const [value, source] of [[null, sender], [PAGE, { ...sender, id: 'foreign' }],
        [{ version: 1, method: 'session.connect', secret: CONNECTED.secret, repository: CONNECTED.repository }, sender],
        [PAGE, { ...sender, tab: { ...sender.tab, incognito: true } }]] as const) expect(await h.gateway.handle(value, source)).toEqual({ state: 'rejected' });
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.local.port.get).not.toHaveBeenCalled();
});
it('github-browser-extension-runtime-C17 manages only exact extension connection/settings/disconnect methods with no secret in returned values', async () => {
    const h = harness(); expect(await h.gateway.handle({ version: 1, method: 'settings.read' }, sender)).toMatchObject({ state: 'ready' });
    expect(await h.connect()).toMatchObject({ state: 'connected' });
    expect(JSON.stringify(h.local.values.get(SETTINGS_KEY))).not.toContain(CONNECTED.secret);
    expect(await h.gateway.handle({ version: 1, method: 'session.status' }, extension)).toMatchObject({ state: 'connected' });
    expect(await h.gateway.handle(PAGE, sender)).toMatchObject({ state: 'current' });
    expect(await h.gateway.handle({ version: 1, method: 'session.disconnect' }, extension)).toMatchObject({ state: 'disconnected' });
    expect(h.ports.notify).toHaveBeenCalled();
});
it('github-browser-extension-runtime-C09 settings writes and explicit invalidation abort old page leases before a late result can leave the gateway', async () => {
    const h = harness(); await h.connect(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const read = h.gateway.handle(PAGE, sender); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(3));
    expect(await h.gateway.handle({ version: 1, method: 'settings.write', expectedRevision: 1,
        settings: { ...DEFAULT_SETTINGS, revision: 1, paused: true } }, extension)).toMatchObject({ state: 'ready', settings: { paused: true } });
    pending.resolve({ state: 'ok', data: { id: '1', login: 'octo' }, etag: '', bytes: 1 });
    expect(await read).toMatchObject({ state: 'stale' }); expect(await h.gateway.handle({ ...PAGE, generation: 2 }, sender)).toMatchObject({ state: 'paused' });
});
it('github-browser-extension-runtime-C08/github-browser-extension-runtime-C14 rejects stale native tab routes, frame contexts and generation regression', async () => {
    const h = harness(); await h.connect();
    h.ports.currentTab.mockResolvedValueOnce({ url: 'https://github.com/other/repo/issues/42', incognito: false, active: true });
    expect(await h.gateway.handle(PAGE, sender)).toMatchObject({ state: 'rejected' });
    h.ports.currentTab.mockResolvedValueOnce({ url: PAGE.route, incognito: true, active: true });
    expect(await h.gateway.handle(PAGE, sender)).toMatchObject({ state: 'rejected' });
    await h.gateway.handle({ ...PAGE, generation: 2 }, sender);
    expect(await h.gateway.handle(PAGE, sender)).toMatchObject({ state: 'rejected' });
    expect(await h.gateway.handle({ ...PAGE, generation: 2, repositoryId: '8' }, sender)).toMatchObject({ state: 'rejected' });
    h.advance(10001); expect(await h.gateway.handle({ ...PAGE, generation: 3 }, sender)).toMatchObject({ state: 'current' });
    h.gateway.invalidate(1); h.gateway.invalidate(999); expect(h.ports.notify).toHaveBeenCalled();
});
it('github-browser-extension-runtime-C08 checks canonical tab identity again after transport and refuses departed pages', async () => {
    const h = harness(); await h.connect();
    h.ports.currentTab.mockResolvedValueOnce({ url: PAGE.route, incognito: false, active: true })
        .mockResolvedValueOnce({ url: 'https://github.com/other/repo', incognito: false, active: true });
    expect(await h.gateway.handle(PAGE, sender)).toMatchObject({ state: 'stale' });
});
it('github-browser-extension-runtime-C18 future settings or persistence failure prevents a partially connected operation', async () => {
    for (const future of [true, false]) {
        const h = harness();
        if (future) h.local.values.set(SETTINGS_KEY, { schemaVersion: 99 });
        else vi.mocked(h.local.port.set).mockRejectedValue(new Error(CONNECTED.secret));
        expect(await h.connect()).toMatchObject({ state: future ? 'unavailable' : 'unavailable' });
        expect(h.service.status().state).toBe('disconnected');
    }
    const h = harness(); vi.mocked(h.local.port.get).mockRejectedValue(new Error('private'));
    expect(await h.gateway.handle({ version: 1, method: 'settings.read' }, sender)).toMatchObject({ state: 'unavailable' });
});
it('github-browser-extension-runtime-C23 bounds per-tab leases and refuses unbounded sender fanout', async () => {
    const h = harness();
    for (let id = 1; id <= 128; id++) expect(await h.gateway.handle(PAGE, { ...sender, tab: { ...sender.tab, id } })).toMatchObject({ state: 'paused' });
    expect(await h.gateway.handle(PAGE, { ...sender, tab: { ...sender.tab, id: 129 } })).toMatchObject({ state: 'busy' });
    h.gateway.invalidate(); expect(await h.gateway.handle(PAGE, sender)).toMatchObject({ state: 'paused' });
});

it('hidden-page release aborts only the matching current generation and ignores obsolete releases', async () => {
    const h = harness(); await h.connect(); await h.gateway.handle(PAGE, sender);
    expect(await h.gateway.handle({ version: 1, method: 'page.release', generation: 0 }, sender)).toMatchObject({ state: 'released' });
    expect(await h.gateway.handle({ version: 1, method: 'page.release', generation: 1 }, sender)).toMatchObject({ state: 'released' });
    expect(await h.gateway.handle({ version: 1, method: 'page.release', generation: 1 }, sender)).toMatchObject({ state: 'released' });
});

it('credential revocation in another request and background-tab transitions fence the final published response', async () => {
    const h = harness(); await h.connect(); const final = deferred<{ url: string; incognito: boolean; active: boolean }>();
    h.ports.currentTab.mockResolvedValueOnce({ url: PAGE.route, incognito: false, active: true }).mockReturnValueOnce(final.promise);
    const read = h.gateway.handle(PAGE, sender); await vi.waitFor(() => expect(h.ports.currentTab).toHaveBeenCalledTimes(2));
    await h.service.revoke(); final.resolve({ url: PAGE.route, incognito: false, active: true }); expect(await read).toMatchObject({ state: 'stale' });
    const hidden = harness(); await hidden.connect(); hidden.ports.currentTab.mockResolvedValueOnce({ url: PAGE.route, incognito: false, active: true })
        .mockResolvedValueOnce({ url: PAGE.route, incognito: false, active: false });
    expect(await hidden.gateway.handle(PAGE, sender)).toMatchObject({ state: 'stale' });
});
