import { buildSourceIdentity } from './build_identity.ts';
import { record } from '../domain/value.ts';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { BrowserStorage } from '../adapters/browser/storage.ts';
import { BrowserCancellation } from '../adapters/browser/cancellation.ts';
import { GitHubGetReader } from '../adapters/github/get_reader.ts';
import { ReadScheduler } from '../application/read_scheduler.ts';
import { SettingsRepository, SETTINGS_KEY } from '../application/settings_repository.ts';
import { ProtectedSessionService } from '../application/protected_session.ts';
import { MessageGateway } from '../application/message_gateway.ts';

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
        void api.tabs.query({ url: 'https://github.com/*' }).then(tabs => {
            for (const tab of tabs.slice(0, 128)) if (tab.id !== undefined) {
                void api.tabs.sendMessage(tab.id, { version: 1, method: 'runtime.invalidated' }).catch(() => undefined);
            }
        }).catch(() => undefined);
    };
    const gateway = new MessageGateway(api.runtime.id, api.runtime.getURL(''), new SettingsRepository(local), sessions,
        { currentTab: id => api.tabs.get(id), openSettings: windowId => api.tabs.create({ url: api.runtime.getURL('runtime.html'), windowId }),
            cancellation: () => new BrowserCancellation(),
            online: () => globalThis.navigator?.onLine !== false, notify });
    const message: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender, respond) => {
        void gateway.handle(value, sender).then(result => respond({ ...(record(result) ? result : { state: 'unavailable' }), sourceTree: buildSourceIdentity() })); return true;
    };
    const removed = (id: number) => gateway.invalidate(id);
    // Native tab events cancel the owning lease even on protected routes and same-URL reloads.
    const updated = (id: number, changes: { url?: string; status?: string }) => {
        if (changes.url || changes.status === 'loading') gateway.invalidate(id);
    };
    const permission = (value: { origins?: string[] }) => {
        if (value.origins?.some(origin => origin === 'https://api.github.com/*' || origin === '<all_urls>')) {
            gateway.invalidate(); void sessions.revoke();
        }
    };
    const storage = (changes: Record<string, unknown>, area: string) => {
        if (area === 'local' && Object.hasOwn(changes, SETTINGS_KEY)) gateway.invalidate();
    };
    const open = () => { void api.tabs.create({ url: api.runtime.getURL('runtime.html') }).catch(() => undefined); };
    // Register all wake listeners synchronously, before any asynchronous initialization.
    api.runtime.onMessage.addListener(message); api.tabs.onRemoved.addListener(removed);
    api.tabs.onUpdated.addListener(updated); api.permissions.onRemoved.addListener(permission);
    api.storage.onChanged.addListener(storage); api.action.onClicked.addListener(open);
    return () => {
        gateway.invalidate(); void sessions.revoke();
        api.runtime.onMessage.removeListener(message); api.tabs.onRemoved.removeListener(removed);
        api.tabs.onUpdated.removeListener(updated); api.permissions.onRemoved.removeListener(permission);
        api.storage.onChanged.removeListener(storage); api.action.onClicked.removeListener(open);
    };
}
