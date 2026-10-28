import { vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { runtimeConfiguration, type PageRequest } from '../../src/domain/runtime_configuration.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import { CONNECTED, PAGE, memoryStore, sessionHarness } from './runtime.ts';

export const CONFIG = { ...PAGE, method: 'page.configuration', manual: false } as const;
export const pageSender = { id: 'test', url: PAGE.route as string, frameId: 0, tab: { id: 1, url: PAGE.route as string, incognito: false } };
export const configurationReply = (request: unknown, settings = DEFAULT_SETTINGS) => ({
    ...runtimeConfiguration(settings, request as PageRequest, null, 0), sourceTree: 'unbundled' });
export function pageConfigurationFixture(settings: Settings = DEFAULT_SETTINGS) {
    const h = sessionHarness(); const local = memoryStore(); local.values.set(SETTINGS_KEY, settings);
    const repository = new SettingsRepository(local.port);
    const ports = { currentTab: vi.fn(async () => ({ url: PAGE.route as string, active: true, incognito: false })),
        openSettings: vi.fn(async () => undefined), cancellation: () => new BrowserCancellation(), online: vi.fn(() => true), notify: vi.fn() };
    const gateway = new MessageGateway('test', 'chrome-extension://test/', repository, h.service, ports);
    return { ...h, sessionPorts: h.ports, local, repository, ports, gateway, call: (value: unknown = CONFIG, source: Sender = pageSender) => gateway.handle(value, source),
        cold: () => h.values.set(SESSION_KEY, CONNECTED),
        connected: async () => { await h.service.connect(CONNECTED.secret, CONNECTED.repository); vi.mocked(h.reader.read).mockClear(); } };
}
export function scopedSettings(paused = false): Settings {
    return { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } }, center: { ...DEFAULT_SETTINGS.center,
        profiles: [{ id: 'repo-profile', name: 'Private profile name', scope: { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' },
            preferences: { density: 'compact', shortcuts: true, paused, features: { 'BEX-NAV-01': false } } }], selected: ['repo-profile'] } };
}
