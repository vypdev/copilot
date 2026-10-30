import { buildSourceIdentity } from './build_identity.ts';
import { record } from '../domain/value.ts';
import { extensionSender } from '../domain/protocol.ts';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { BrowserStorage } from '../adapters/browser/storage.ts';
import { BrowserCancellation } from '../adapters/browser/cancellation.ts';
import { GitHubGetReader } from '../adapters/github/get_reader.ts';
import { ReadScheduler } from '../application/read_scheduler.ts';
import { SETTINGS_KEY } from '../application/settings_repository.ts';
import { createHistory } from './history_runtime.ts';
import { HelperSamples } from '../application/helper_samples.ts';
import { ProtectedSessionService } from '../application/protected_session.ts';
import { MessageGateway } from '../application/message_gateway.ts';
import { createCenter, centerIdentifier } from './center_runtime.ts';
import { NamedSessions } from '../application/named_sessions.ts';
import { centerCommandRoute } from '../domain/shortcuts.ts';
import { centerLocationHash } from '../domain/center_routes.ts';
import { TEMPORARY_PAUSES_KEY, TemporaryPauseReader } from '../application/temporary_pause_reader.ts';
import { TemporaryPauseGuard } from '../application/temporary_pause_guard.ts';
import { TemporaryPauseStore } from '../application/temporary_pause_store.ts';
import { ClosedPauseCleanup } from '../application/closed_pause_cleanup.ts';

export function startBackground(api: BrowserApi): () => void {
    const local = new BrowserStorage(api.storage.local);
    const session = new BrowserStorage(api.storage.session);
    const pauseGuard = new TemporaryPauseGuard();
    const pauseStore = new TemporaryPauseStore(session, pauseGuard, { protectedArea: () => session.protect(), changed: () => { gateway.invalidate(); } });
    const closedPauses = new ClosedPauseCleanup(pauseStore);
    const pauses = new TemporaryPauseReader(session, () => session.protect(), () => pauseGuard.blocked);
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
    const { history, policies } = createHistory(api, local, () => {
        void api.runtime.sendMessage({ version: 1, method: 'center.history.invalidated' }).catch(() => undefined);
    });
    const helpers = new HelperSamples({ now: () => Date.now(),
        changed: () => { void api.runtime.sendMessage({ version: 1, method: 'center.health.invalidated' }).catch(() => undefined); },
        admit: (fact, current) => history.writer.admit('diagnostics', fact, current), retention: ticket => history.writer.retention(ticket) });
    const settings = history.settings;
    const connections = new NamedSessions(session, sessions, { protected: () => session.protect(), identifier: () => `s-${centerIdentifier()}`,
        changed: notify, connected: async (id, current, trace) => {
            await settings.updateObserved(value => ({ ...value, repositories: { ...value.repositories, [id]: { ...value.repositories[id], connected: true } } }), current, trace);
        } });
    const gateway = new MessageGateway(api.runtime.id, api.runtime.getURL(''), settings, sessions,
        { currentTab: id => api.tabs.get(id), sourceTree: buildSourceIdentity, openSettings: async (windowId, command, health) => {
            const opened = await api.tabs.create({ url: api.runtime.getURL('runtime.html') + (command === undefined ? '' : centerLocationHash({ route: centerCommandRoute(command) })), windowId });
            try { if (health && record(opened) && typeof opened.id === 'number') helpers.attach(health, opened.id); }
            catch { /* Source-sample delivery failure cannot change an already completed native open. */ }
            return opened;
        },
            cancellation: () => new BrowserCancellation(),
            online: () => globalThis.navigator?.onLine !== false, notify }, createCenter(api, settings, sessions, notify, connections, { owner: history, policies }, helpers, pauseStore), connections, helpers, pauses);
    const message: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender, respond) => {
        void gateway.handle(value, sender).then(result => respond({ ...(record(result) ? result : { state: 'unavailable' }), sourceTree: buildSourceIdentity() })); return true;
    };
    const removed = (id: number) => { gateway.invalidate(id); gateway.releaseCenterTab(id); gateway.releaseHelperTab(id); closedPauses.close(id); };
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
        if (area === 'session' && Object.hasOwn(changes, TEMPORARY_PAUSES_KEY)) gateway.invalidate();
        if (area === 'local' && Object.hasOwn(changes, SETTINGS_KEY)) {
            history.invalidate(); gateway.invalidate(); void history.refresh();
        }
    };
    const open = () => { void api.tabs.create({ url: api.runtime.getURL('runtime.html') }).catch(() => undefined); };
    // Register all wake listeners synchronously, before any asynchronous initialization.
    api.runtime.onMessage.addListener(message); api.tabs.onRemoved.addListener(removed);
    api.tabs.onUpdated.addListener(updated); api.permissions.onRemoved.addListener(permission);
    api.tabs.onActivated.addListener(activated);
    api.storage.onChanged.addListener(storage); api.action.onClicked.addListener(open);
    void history.refresh();
    return () => {
        closedPauses.stop(); history.stop(); gateway.shutdown(); void sessions.revoke();
        api.runtime.onMessage.removeListener(message); api.tabs.onRemoved.removeListener(removed);
        api.tabs.onUpdated.removeListener(updated); api.permissions.onRemoved.removeListener(permission);
        api.tabs.onActivated.removeListener(activated);
        api.storage.onChanged.removeListener(storage); api.action.onClicked.removeListener(open);
    };
}
