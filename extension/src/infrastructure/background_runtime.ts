import { buildSourceIdentity } from './build_identity.ts';
import { record } from '../domain/value.ts';
import { extensionSender } from '../domain/protocol.ts';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { BrowserStorage } from '../adapters/browser/storage.ts';
import { BrowserCancellation } from '../adapters/browser/cancellation.ts';
import { GitHubGetReader } from '../adapters/github/get_reader.ts';
import { ReadScheduler } from '../application/read_scheduler.ts';
import { SettingsRepository, SETTINGS_KEY } from '../application/settings_repository.ts';
import { ProtectedSessionService } from '../application/protected_session.ts';
import { MessageGateway } from '../application/message_gateway.ts';
import { createCenter, centerIdentifier } from './center_runtime.ts';
import { NamedSessions } from '../application/named_sessions.ts';

export function startBackground(api: BrowserApi): () => void {
    const local = new BrowserStorage(api.storage.local);
    const session = new BrowserStorage(api.storage.session);
    const scheduler = new ReadScheduler(session, new GitHubGetReader(), () => Date.now(), () => Math.random() * 1000);
    const sessions = new ProtectedSessionService(session, scheduler, {
        cancellation: () => new BrowserCancellation(),
        permitted: async () => api.extension?.inIncognitoContext !== true
            && await api.permissions.contains({ origins: ['https://api.github.com/*'] }),
        protected: () => session.protect(),
    });
    const notify = () => {
        void api.runtime.sendMessage({ version: 1, method: 'center.invalidated' }).catch(() => undefined);
        void api.tabs.query({ url: 'https://github.com/*' }).then(tabs => {
            for (const tab of tabs.slice(0, 128)) if (tab.id !== undefined) {
                void api.tabs.sendMessage(tab.id, { version: 1, method: 'runtime.invalidated' }).catch(() => undefined);
            }
        }).catch(() => undefined);
    };
    const settings = new SettingsRepository(local);
    const connections = new NamedSessions(session, sessions, { protected: () => session.protect(), identifier: () => `s-${centerIdentifier()}`,
        changed: notify, connected: async (id, current) => {
            await settings.update(value => ({ ...value, repositories: { ...value.repositories, [id]: { ...value.repositories[id], connected: true } } }), current);
        } });
    const gateway = new MessageGateway(api.runtime.id, api.runtime.getURL(''), settings, sessions,
        { currentTab: id => api.tabs.get(id), openSettings: windowId => api.tabs.create({ url: api.runtime.getURL('runtime.html'), windowId }),
            cancellation: () => new BrowserCancellation(),
            online: () => globalThis.navigator?.onLine !== false, notify }, createCenter(api, settings, sessions, notify, connections), connections);
    const message: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender, respond) => {
        void gateway.handle(value, sender).then(result => respond({ ...(record(result) ? result : { state: 'unavailable' }), sourceTree: buildSourceIdentity() })); return true;
    };
    const removed = (id: number) => { gateway.invalidate(id); gateway.releaseCenterTab(id); };
    // Native tab events cancel the owning lease even on protected routes and same-URL reloads.
    const updated = (id: number, changes: { url?: string; status?: string }) => {
        if (changes.url || changes.status === 'loading') gateway.invalidate(id);
        if (changes.status === 'loading' || (changes.url && !extensionSender({ id: api.runtime.id, url: changes.url }, api.runtime.id, api.runtime.getURL('')))) gateway.releaseCenterTab(id);
    };
    // An activated tab's URL may still be unavailable; use this only to cancel, never to authorize.
    const activated = () => { gateway.invalidate(); };
    const permission = (value: { origins?: string[] }) => {
        if (value.origins?.some(origin => origin === 'https://api.github.com/*' || origin === '<all_urls>')) {
            gateway.invalidate(undefined, false); void connections.revokeAll().catch(() => undefined);
        }
    };
    const storage = (changes: Record<string, unknown>, area: string) => {
        if (area === 'local' && Object.hasOwn(changes, SETTINGS_KEY)) gateway.invalidate();
    };
    const open = () => { void api.tabs.create({ url: api.runtime.getURL('runtime.html') }).catch(() => undefined); };
    // Register all wake listeners synchronously, before any asynchronous initialization.
    api.runtime.onMessage.addListener(message); api.tabs.onRemoved.addListener(removed);
    api.tabs.onUpdated.addListener(updated); api.permissions.onRemoved.addListener(permission);
    api.tabs.onActivated.addListener(activated);
    api.storage.onChanged.addListener(storage); api.action.onClicked.addListener(open);
    return () => {
        gateway.shutdown(); void sessions.revoke();
        api.runtime.onMessage.removeListener(message); api.tabs.onRemoved.removeListener(removed);
        api.tabs.onUpdated.removeListener(updated); api.permissions.onRemoved.removeListener(permission);
        api.tabs.onActivated.removeListener(activated);
        api.storage.onChanged.removeListener(storage); api.action.onClicked.removeListener(open);
    };
}
