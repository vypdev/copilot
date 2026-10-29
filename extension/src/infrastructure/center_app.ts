import { mount, unmount, flushSync, tick } from 'svelte';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { CenterClient } from '../application/center_client.ts';
import { CenterNavigation } from '../application/center_navigation.ts';
import { SETTINGS_KEY } from '../application/settings_repository.ts';
import { centerFrame } from '../domain/center_frame.ts';
import { parseCenterLocation } from '../domain/center_routes.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import type { Settings } from '../domain/settings.ts';
import { keys, record } from '../domain/value.ts';
import type { CenterActions } from '../domain/center_ui.ts';
import type { CenterSurface } from '../presentation/center_surface.ts';
import CenterHost from '../presentation/CenterHost.svelte';
import { loadCenterPage, loadInventoryPage, loadPrivacyPage, loadSupportPage } from './center_pages.ts';
import { downloadCenterSettings, readCenterImport } from './center_files.ts';
import { buildSourceIdentity } from './build_identity.ts';
import { connectionActions } from './center_connections.ts';
import { EMPTY_INVENTORY_NAVIGATION } from '../domain/inventory_filters.ts';
import { currentCenterSettings } from '../domain/center_client_view.ts';
import { BrowserPermissionReader } from '../adapters/browser/permission_reader.ts';
import { PermissionInspector } from '../application/permission_inspector.ts';
import { readPackageIdentity } from '../adapters/browser/package_reader.ts';

/** Native options-page composition. The UI receives preferences and callbacks, never reusable authority. */
export function startCenter(api: BrowserApi, document: Document, nativeLanguage: string): () => void {
    const window = document.defaultView;
    if (!window) return () => undefined;
    const canonical = api.runtime.getURL('runtime.html');
    if (window.location.search || !parseCenterLocation(window.location.hash)) {
        window.location.replace(`${canonical}#/recovery`); return () => undefined;
    }
    const client = new CenterClient({ sourceTree: buildSourceIdentity(), send: message => api.runtime.sendMessage(message) });
    const packageIdentity = readPackageIdentity(api, buildSourceIdentity());
    let stopped = false; let draftEpoch = 0; let savedRevision = -1; let savedCandidate: Settings | null = null; let importGeneration = 0;
    let inventory = EMPTY_INVENTORY_NAVIGATION;
    let connectionReadPending = false; let focused = true;
    const permissionReader = new BrowserPermissionReader(api);
    const inspector = new PermissionInspector({ query: capability => permissionReader.query(capability),
        after: (milliseconds, action) => { const id = window.setTimeout(action, milliseconds); return () => window.clearTimeout(id); }, changed: () => publish() });
    const listeners = new Set<Parameters<CenterSurface['subscribe']>[0]>();
    const focus = (selector: string) => { void tick().then(() => { if (!stopped) document.querySelector<HTMLElement>(selector)?.focus(); }); };
    const navigation = new CenterNavigation(window.location.hash, {
        replace: hash => { window.history.replaceState(null, '', `${canonical}${hash}`); },
        changed: () => { retireObservations(); focus(navigation.pendingLocation ? '[role=alert] button' : 'main h1'); readObservations(); },
    });
    const frame = () => centerFrame(client.view, navigation.location, navigation.pendingLocation, nativeLanguage, draftEpoch, navigation.hasDraft, inventory, inspector.view, packageIdentity);
    function publish(): void {
        if (stopped) return;
        const value = frame(); document.documentElement.lang = value.copy.locale; document.title = value.copy.messages.title;
        for (const listener of listeners) listener(value);
    }
    const actions: CenterActions = {
        connections: connectionActions(api, document, client, () => !stopped && ['connections', 'repositories'].includes(navigation.location.route), value => { navigation.dirty(value); publish(); }),
        preview: (intent, revision) => { void client.preview(intent, revision); },
        confirm: () => { void client.confirm(); }, cancel: () => { void client.cancel(); },
        dismiss: () => { void client.dismiss(); }, reload: () => { retireObservations(); void client.refresh().then(readObservations); },
        takeControl: () => { void client.takeControl(); }, dirty: value => { navigation.dirty(value); publish(); },
        stay: () => navigation.stay(), leave: () => {
            if (client.view.phase !== 'committing') void client.dismiss().then(() => { if (!stopped) navigation.leave(); });
        },
        focusContent: () => { document.querySelector<HTMLElement>('main')?.focus(); },
        browseInventory: value => { inventory = value; publish(); },
        inspectPermissions: () => readPermissions(),
        inspectConnection: () => { if (!stopped && focused && document.visibilityState !== 'hidden' && navigation.location.route === 'privacy') void client.connections(); },
        exportSettings: async () => downloadCenterSettings(document, client.view.data?.settings ?? null),
        importSettings: async revision => {
            const origin = navigation.location; const epoch = draftEpoch; const generation = ++importGeneration;
            const settings = await readCenterImport(document);
            if (!settings || stopped || origin !== navigation.location || epoch !== draftEpoch || generation !== importGeneration) return false;
            await client.preview({ type: 'import', settings }, revision); return true;
        },
    };
    const unsubscribe = client.subscribe(view => {
        navigation.protect(view.review?.state === 'preview' || view.review?.state === 'unknown', view.phase === 'committing');
        if (view.review?.state === 'saved' && savedRevision < view.review.revision + 1) savedCandidate = { ...view.review.after, revision: view.review.revision + 1 };
        if (savedCandidate && view.data?.settings && sameSettingsContent(savedCandidate, view.data.settings)) {
            savedRevision = savedCandidate.revision; savedCandidate = null; draftEpoch++; navigation.dirty(false);
        }
        publish();
        if (connectionReadPending && view.phase === 'ready' && !view.review) queueMicrotask(() => {
            if (stopped || !connectionReadPending || client.view.phase !== 'ready' || client.view.review) return;
            connectionReadPending = false; readConnections();
        });
        if (view.review?.state === 'preview') focus('#settings-review-heading');
    });
    const surface: CenterSurface = { initial: frame(), actions, load: loadCenterPage, loadInventory: loadInventoryPage, loadPrivacy: loadPrivacyPage, loadSupport: loadSupportPage,
        subscribe: listener => { listeners.add(listener); listener(frame()); return () => { listeners.delete(listener); }; } };
    const host = mount(CenterHost, { target: document.body, props: { surface } }); flushSync();
    function readConnections(): void {
        const route = navigation.location.route;
        if (route === 'features' && currentCenterSettings(client.view) === null) return;
        if (['connections', 'repositories', 'profiles', 'features'].includes(route)) void client.connections();
    }
    function readPermissions(): void { if (!stopped && focused && document.visibilityState !== 'hidden' && navigation.location.route === 'privacy') inspector.read(); }
    function readObservations(): void { readConnections(); readPermissions(); }
    function retireObservations(): void { client.invalidateConnections(); inspector.invalidate(); }
    const hash = () => navigation.navigate(window.location.hash);
    const visible = () => {
        if (stopped) return;
        retireObservations();
        if (focused && document.visibilityState !== 'hidden') { connectionReadPending = true; void client.refresh(); readPermissions(); }
    };
    const blurred = () => { focused = false; retireObservations(); };
    const foreground = () => { focused = true; visible(); };
    const unobservePermissions = permissionReader.observe(visible);
    const changed = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && Object.hasOwn(changes, SETTINGS_KEY)) visible(); };
    const invalidated: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender) => {
        if (sender.id === api.runtime.id && !sender.tab && record(value) && keys(value, ['version', 'method'])
            && value.version === 1 && value.method === 'center.invalidated') visible();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (navigation.guarded) { event.preventDefault(); event.returnValue = ''; } };
    const stop = () => {
        if (stopped) return;
        stopped = true; inspector.stop(); unobservePermissions(); unsubscribe(); client.stop(); listeners.clear(); void unmount(host);
        window.removeEventListener('hashchange', hash); document.removeEventListener('visibilitychange', visible);
        window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', stop);
        window.removeEventListener('blur', blurred); window.removeEventListener('focus', foreground);
        api.storage.onChanged.removeListener(changed); api.runtime.onMessage.removeListener(invalidated);
    };
    window.addEventListener('hashchange', hash); document.addEventListener('visibilitychange', visible);
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('pagehide', stop);
    window.addEventListener('blur', blurred); window.addEventListener('focus', foreground);
    api.storage.onChanged.addListener(changed); api.runtime.onMessage.addListener(invalidated);
    readPermissions(); void client.start().then(readConnections); return stop;
}
