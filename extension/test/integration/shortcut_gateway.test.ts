import { afterEach, expect, it, vi } from 'vitest';
import { MessageGateway, type GatewayPorts } from '../../src/application/message_gateway.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { CENTER_COMMANDS, centerCommandRoute } from '../../src/domain/shortcuts.ts';
import { parseMessage } from '../../src/domain/protocol.ts';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { pageSender } from '../fixtures/page_configuration.ts';
import { memoryStore, sessionHarness, deferred } from '../fixtures/runtime.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const request = { version: 1, method: 'settings.open', command: 'open-help' } as const;
const native = { url: pageSender.url, incognito: false, active: true, windowId: 1 };
function fixture() {
    const session = sessionHarness(); const store = memoryStore();
    const ports = { currentTab: vi.fn<GatewayPorts['currentTab']>(async () => native), openSettings: vi.fn<GatewayPorts['openSettings']>(async () => undefined),
        cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() };
    const gateway = new MessageGateway('test', 'chrome-extension://test/', new SettingsRepository(store.port), session.service, ports);
    stops.push(() => gateway.shutdown()); return { gateway, ports, call: () => gateway.handle(request, pageSender) };
}
it.each(CENTER_COMMANDS)('the real background composition opens %s in the verified native window without GitHub or additional preference operations', async command => {
    const h = backgroundCenterFixture(); stops.push(h.stop);
    // Separate the independent, listener-first consent bootstrap from the shortcut's own effects.
    await new Promise<void>(resolve => { setImmediate(resolve); });
    expect(h.localArea.get).toHaveBeenCalledExactlyOnceWith(SETTINGS_KEY); vi.mocked(h.localArea.get).mockClear();
    expect(await h.call({ ...request, command }, pageSender)).toMatchObject({ state: 'opened', sourceTree: 'unbundled' });
    expect(h.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: `chrome-extension://test/runtime.html#/${centerCommandRoute(command)}`, windowId: 1 });
    expect(h.provider).not.toHaveBeenCalled(); expect(h.localArea.get).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled();
    expect(h.localArea.set).not.toHaveBeenCalled();
});
it.each([undefined, null, 'run-shell', 'https://evil.invalid', 'open-help\n', 1])('an invalid command operand %j cannot broaden the legacy open method', async command => {
    const h = fixture(); expect(parseMessage({ ...request, command })).toBeNull();
    expect(await h.gateway.handle({ ...request, command }, pageSender)).toEqual({ state: 'rejected' }); expect(h.ports.currentTab).not.toHaveBeenCalled();
});
it('an extra destination or a forged sender is rejected before reading the native tab', async () => {
    const h = fixture(); expect(await h.gateway.handle({ ...request, url: 'https://evil.invalid' }, pageSender)).toEqual({ state: 'rejected' });
    for (const patch of [{ id: 'foreign' }, { frameId: 1 }, { url: 'https://github.com/login' }, { tab: { ...pageSender.tab, incognito: true } }]) {
        expect(await h.gateway.handle(request, { ...pageSender, ...patch })).toEqual({ state: 'rejected' });
    }
    expect(h.ports.currentTab).not.toHaveBeenCalled();
});
it.each(['tab', 'global', 'shutdown'] as const)('a native %s retirement while current-tab facts are pending prevents the opening effect', async retirement => {
    const h = fixture(); const wait = deferred<typeof native>(); h.ports.currentTab.mockReturnValueOnce(wait.promise); const opening = h.call();
    if (retirement === 'tab') h.gateway.invalidate(1); else if (retirement === 'global') h.gateway.invalidate(); else h.gateway.shutdown();
    wait.resolve(native); expect(await opening).toEqual({ state: 'stale' }); expect(h.ports.openSettings).not.toHaveBeenCalled();
});
it('one pending ticket per tab and128 total tickets bound fanout even when native tab inspection never finishes', async () => {
    const h = fixture(); const wait = deferred<typeof native>(); h.ports.currentTab.mockImplementation(() => wait.promise);
    const calls = Array.from({ length: 128 }, (_, index) => h.gateway.handle(request, { ...pageSender, tab: { ...pageSender.tab, id: index + 1 } }));
    expect(await h.call()).toEqual({ state: 'busy' });
    expect(await h.gateway.handle(request, { ...pageSender, tab: { ...pageSender.tab, id: 129 } })).toEqual({ state: 'busy' });
    expect(h.ports.currentTab).toHaveBeenCalledTimes(128); h.gateway.invalidate(); wait.resolve(native);
    expect((await Promise.all(calls)).every(value => (value as { state: string }).state === 'stale')).toBe(true);
    expect(h.ports.openSettings).not.toHaveBeenCalled(); expect(await h.call()).toEqual({ state: 'opened' });
});
it('a retired ticket settling cannot release the newer pending ticket for the same tab', async () => {
    const h = fixture(); const first = deferred<typeof native>(); const second = deferred<typeof native>();
    h.ports.currentTab.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const older = h.call(); h.gateway.invalidate(1); const newer = h.call(); first.resolve(native); expect(await older).toEqual({ state: 'stale' });
    expect(await h.call()).toEqual({ state: 'busy' }); second.resolve(native); expect(await newer).toEqual({ state: 'opened' });
    expect(h.ports.openSettings).toHaveBeenCalledExactlyOnceWith(1, 'open-help');
});
it.each(['inspect', 'open'] as const)('a failed native %s releases its pending ticket without retrying or exposing provider text', async failure => {
    const h = fixture(); if (failure === 'inspect') h.ports.currentTab.mockRejectedValueOnce(new Error('private-native'));
    else h.ports.openSettings.mockRejectedValueOnce(new Error('private-native'));
    expect(await h.call()).toEqual({ state: 'unavailable' }); expect(await h.call()).toEqual({ state: 'opened' });
    expect(h.ports.currentTab).toHaveBeenCalledTimes(2);
});
it('retirement after an opening effect is accepted does not pretend that the acknowledged tab was undone', async () => {
    const h = fixture(); const wait = deferred<void>(); h.ports.openSettings.mockReturnValueOnce(wait.promise); const opening = h.call();
    await vi.waitFor(() => expect(h.ports.openSettings).toHaveBeenCalledOnce()); h.gateway.invalidate(1); wait.resolve();
    expect(await opening).toEqual({ state: 'opened' }); expect(h.ports.openSettings).toHaveBeenCalledOnce();
});
it('a queued native listener after background shutdown cannot admit a new opening or inspect a tab', async () => {
    const h = fixture(); h.gateway.shutdown(); h.gateway.shutdown(); expect(await h.call()).toEqual({ state: 'rejected' });
    expect(h.ports.currentTab).not.toHaveBeenCalled(); expect(h.ports.openSettings).not.toHaveBeenCalled();
});
