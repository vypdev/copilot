import { vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { runtimeConfiguration, type PageRequest } from '../../src/domain/runtime_configuration.ts';
import type { SessionIdentity } from '../../src/domain/session.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import { nativePauseProvenance } from '../../src/domain/temporary_pause_observation.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';
import { TemporaryPauseReader } from '../../src/application/temporary_pause_reader.ts';
import { SessionPreferenceAdmission } from '../../src/application/session_preference_admission.ts';
import { SessionPreferencesReader } from '../../src/application/session_preferences_reader.ts';
import { NamedSessions } from '../../src/application/named_sessions.ts';
import { CONNECTED, PAGE, memoryStore, sessionHarness } from './runtime.ts';

export const CONFIG = { ...PAGE, method: 'page.configuration', manual: false } as const;
export const pageSender = { id: 'test', url: PAGE.route as string, frameId: 0, tab: { id: 1, url: PAGE.route as string, incognito: false } };
export const clearNativeRestriction = () => ({ native: nativePauseProvenance({ condition: 'clear', loaded: { state: 'ready', value: DEFAULT_TEMPORARY_PAUSES } }, 1), claimedRepository: false, retainedScope: false,
    session: { worker: 'clear', native: 'ready', scope: 'empty', restricted: false } as const });
export function emptyPreferenceAdmission(h: Pick<ReturnType<typeof sessionHarness>, 'port' | 'service'>): SessionPreferenceAdmission {
    const connections = new NamedSessions(h.port, h.service, { protected: async () => true, identifier: () => 's-test', changed: () => undefined, connected: async () => undefined });
    return new SessionPreferenceAdmission(new SessionPreferencesReader(memoryStore().port, async () => true), connections);
}
export const configurationReply = (request: unknown, settings = DEFAULT_SETTINGS, identity: SessionIdentity | null = null) => {
    const value = runtimeConfiguration(settings, request as PageRequest, identity, 0, clearNativeRestriction());
    if (!value) throw new Error('invalid-configuration-fixture'); return { ...value, sourceTree: 'unbundled' };
};
export function pageConfigurationFixture(settings: Settings = DEFAULT_SETTINGS) {
    const h = sessionHarness(); const local = memoryStore(); local.values.set(SETTINGS_KEY, settings);
    const repository = new SettingsRepository(local.port);
    const ports = { currentTab: vi.fn(async () => ({ url: PAGE.route as string, active: true, incognito: false })),
        openSettings: vi.fn(async () => undefined), cancellation: () => new BrowserCancellation(), online: vi.fn(() => true), notify: vi.fn() };
    const gateway = new MessageGateway('test', 'chrome-extension://test/', repository, h.service, ports, undefined, undefined, undefined, new TemporaryPauseReader(memoryStore().port, async () => true), emptyPreferenceAdmission(h));
    return { ...h, sessionPorts: h.ports, local, repository, ports, gateway, call: (value: unknown = CONFIG, source: Sender = pageSender) => gateway.handle(value, source),
        cold: () => h.values.set(SESSION_KEY, CONNECTED),
        connected: async () => { await h.service.connect(CONNECTED.secret, CONNECTED.repository); vi.mocked(h.reader.read).mockClear(); } };
}
export function scopedSettings(paused = false): Settings {
    return { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } }, center: { ...DEFAULT_SETTINGS.center,
        profiles: [{ id: 'repo-profile', name: 'Private profile name', scope: { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' },
            preferences: { density: 'compact', shortcuts: true, paused, features: { 'BEX-NAV-01': false } } }], selected: ['repo-profile'] } };
}
