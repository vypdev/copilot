import { vi } from 'vitest';
import { namedSessionsFixture, CONNECTION_INPUT } from './named_sessions.ts';
import { memoryStore } from './runtime.ts';
import { CONFIG, pageSender } from './page_configuration.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SessionPreferencesReader, SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { SessionPreferencesStore } from '../../src/application/session_preferences_store.ts';
import { SessionPreferenceAdmission } from '../../src/application/session_preference_admission.ts';
import { TemporaryPauseReader } from '../../src/application/temporary_pause_reader.ts';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import type { Preferences } from '../../src/domain/preferences.ts';

export async function sessionPreferenceRuntimeFixture(connected = true) {
    const h = namedSessionsFixture();
    if (connected) await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const local = memoryStore(); local.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } });
    const settings = new SettingsRepository(local.port);
    const store = new SessionPreferencesStore(h.port, { protectedArea: async () => true, changed: () => gateway.invalidate() });
    const reader = new SessionPreferencesReader(h.port, async () => true, () => store.guard.condition);
    const admission = new SessionPreferenceAdmission(reader, h.connections);
    const ports = { currentTab: vi.fn(async (): Promise<{ url: string; incognito: boolean; active: boolean }> => ({ url: CONFIG.route, incognito: false, active: true })),
        openSettings: async () => undefined, cancellation: () => new BrowserCancellation(), online: () => true, notify: vi.fn() };
    const gateway = new MessageGateway('test', 'chrome-extension://test/', settings, h.service, ports, undefined, h.connections, undefined,
        new TemporaryPauseReader(h.port, async () => true), admission);
    const override = async (preferences: Partial<Preferences>) => {
        const binding = await h.connections.preferenceBinding(h.current); if (binding.state !== 'ready') throw new Error('fixture-binding-unavailable');
        h.values.set(SESSION_PREFERENCES_KEY, { schemaVersion: 1, revision: 1, scope: binding.context.scope, preferences });
    };
    vi.mocked(h.reader.read).mockClear(); vi.mocked(h.port.get).mockClear(); vi.mocked(h.port.set).mockClear();
    return { ...h, local, settings, store, admission, ports, gateway, override,
        call: (value: unknown = CONFIG, sender: Sender = pageSender) => gateway.handle(value, sender) };
}
