import { mount, unmount, flushSync, tick } from 'svelte';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { CenterClient } from '../application/center_client.ts';
import { CenterChannelClient } from '../adapters/browser/center_channel_client.ts';
import { CenterNavigation } from '../application/center_navigation.ts';
import { SETTINGS_KEY } from '../application/settings_repository.ts';
import { centerFrame } from '../domain/center_frame.ts';
import { parseCenterLocation, type CenterLocation } from '../domain/center_routes.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import type { Settings } from '../domain/settings.ts';
import { keys, record } from '../domain/value.ts';
import type { CenterActions } from '../domain/center_ui.ts';
import type { CenterSurface } from '../presentation/center_surface.ts';
import CenterHost from '../presentation/CenterHost.svelte';
import { loadCenterPage, loadInventoryPage, loadPrivacyPage, loadSupportPage, loadHistoryPage, loadPausesPage, loadSessionPreferencesPage } from './center_pages.ts';
import { createCenterSessionPreferences } from './center_session_preferences.ts';
import { downloadCenterSettings, readCenterImport } from './center_files.ts';
import { buildSourceIdentity } from './build_identity.ts';
import { connectionActions } from './center_connections.ts';
import { EMPTY_INVENTORY_NAVIGATION } from '../domain/inventory_filters.ts';
import { currentCenterSettings } from '../domain/center_client_view.ts';
import { BrowserPermissionReader } from '../adapters/browser/permission_reader.ts';
import { PermissionInspector } from '../application/permission_inspector.ts';
import { readPackageIdentity } from '../adapters/browser/package_reader.ts';
import { PauseClient } from '../application/pause_client.ts';
import { pauseTargetInvalidation } from '../domain/pause_invalidation.ts';
import { HistoryClient } from '../application/history_client.ts';
import { downloadHistory } from './history_files.ts';
import type { HistoryReview } from '../domain/history_client_view.ts';
import { CurrentOperationReader } from '../application/current_operation_reader.ts';
import { HelperSampleReader } from '../application/helper_sample_reader.ts';
import { createCenterApiCache } from './center_api_cache.ts';
import { subscribeCenterRecoveryFocus } from './center_recovery_focus.ts';

/** Native options-page composition. The UI receives preferences and callbacks, never reusable authority. */
export function startCenter(api: BrowserApi, document: Document, nativeLanguage: string): () => void {
    const window = document.defaultView;
    if (!window) return () => undefined;
    const canonical = api.runtime.getURL('runtime.html');
    if (window.location.search || !parseCenterLocation(window.location.hash)) {
        window.location.replace(`${canonical}#/recovery`); return () => undefined;
    }
    const channel = new CenterChannelClient(api.runtime, () => client.disconnected());
    const client = new CenterClient({ sourceTree: buildSourceIdentity(), send: message => channel.send(message), contextChanged: () => {
        operation.clear(); void operation.read(); helpers.invalidate(); void helpers.read(); pauses.contextChanged(); readPauses(); transient.contextChanged(); cache.contextChanged();
    } });
    const packageIdentity = readPackageIdentity(api, buildSourceIdentity());
    let stopped = false; let draftEpoch = 0; let savedRevision = -1; let savedCandidate: Settings | null = null; let importGeneration = 0;
    let inventory = EMPTY_INVENTORY_NAVIGATION;
    let connectionReadPending = false; let focused = true;
    const operation = new CurrentOperationReader({ request: () => client.readOperation(), eligible: () => !stopped && focused && document.visibilityState !== 'hidden', changed: () => publish() });
    const helpers = new HelperSampleReader({ request: () => client.readHelperSample(), eligible: () => !stopped && focused
        && document.visibilityState !== 'hidden' && ['diagnostics', 'help'].includes(navigation.location.route)
        && (client.view.role === 'editor' || client.view.role === 'observer') && client.view.issue !== 'incompatible', changed: () => publish() });
    const permissionReader = new BrowserPermissionReader(api);
    const inspector = new PermissionInspector({ query: capability => permissionReader.query(capability),
        after: (milliseconds, action) => { const id = window.setTimeout(action, milliseconds); return () => window.clearTimeout(id); }, changed: () => publish() });
    const listeners = new Set<Parameters<CenterSurface['subscribe']>[0]>();
    const focus = (selector: string, current: () => boolean = () => true) => { void tick().then(() => { if (!stopped && current()) document.querySelector<HTMLElement>(selector)?.focus(); }); };
    const navigation = new CenterNavigation(window.location.hash, {
        replace: hash => { window.history.replaceState(null, '', `${canonical}${hash}`); },
        changed: () => {
            if (observedLocation !== navigation.location) { observedLocation = navigation.location; observeDestination(); retireObservations(); readObservations(); }
            publish(); focus(navigation.pendingLocation ? '[role=alert] button' : 'main h1');
        },
    });
    let observedLocation = navigation.location;
    let deliveredLocation: CenterLocation | null = null;
    const history: HistoryClient = new HistoryClient({ request: input => client.requestHistory(input), now: () => Date.now(),
        canMutate: () => !cache.client.held && !pauseHeld() && historyVisible() && client.view.phase === 'ready' && client.view.role === 'editor' && !client.view.review && !navigation.hasDraft
            && (client.view.issue === null || client.view.issue === 'invalid' || client.view.issue === 'unchanged'),
        download: async (kind, content) => downloadHistory(document, kind, content) });
    const pauses: PauseClient = new PauseClient({ request: input => client.requestPauses(input), now: () => Date.now(), canRead: () => pauseVisible(),
        canMutate: () => pauseVisible() && client.view.role === 'editor' && !['claiming', 'previewing', 'committing', 'stopped'].includes(client.view.phase)
            && !client.view.review && !navigation.hasDraft && !cache.client.held && !historyHeld() && pauses.reader.view.current
            && pauses.reader.view.data?.loaded.state === 'ready' && !pauses.reader.view.data.pending });
    const transient = createCenterSessionPreferences(client, navigation, { foreground: () => !stopped && focused && document.visibilityState !== 'hidden',
        blocked: () => cache.client.held || historyHeld() || pauses.view.busy || !!pauses.view.review, changed: () => { protect(); publish(); }, focus: () => focus('#session-preference-review-heading') });
    const cache = createCenterApiCache(client, navigation, { foreground: () => !stopped && focused && document.visibilityState !== 'hidden', blocked: () => historyHeld() || pauseHeld(),
        changed: () => { protect(); publish(); }, focus: review => { const view = cache.client.view;
            focus(review ? '#api-cache-review-heading' : '#api-cache-review-button', () => cache.client.view === view && focused && document.visibilityState !== 'hidden'
                && navigation.location.route === 'privacy' && (document.activeElement === document.body || document.querySelector('[data-api-cache]')?.contains(document.activeElement) === true)); } });
    const pauseHeld = (): boolean => pauses.view.busy || !!pauses.view.review || transient.held();
    const historyHeld = (): boolean => history.view.busy || history.view.exportBusy || !!history.view.review || !!history.view.exportReview;
    const protect = () => navigation.protect(cache.client.view.open || !!transient.client.view.review || !!pauses.view.review || !!history.view.review || !!history.view.exportReview || client.view.review?.state === 'preview'
        || client.view.review?.state === 'unknown', cache.client.busy || client.view.phase === 'committing' || history.view.busy || history.view.exportBusy || pauses.view.busy || transient.client.view.busy);
    const frame = () => centerFrame(client.view, navigation.location, navigation.pendingLocation, nativeLanguage, draftEpoch, navigation.hasDraft, inventory, inspector.view, packageIdentity, history.view, client.visitDelivery, operation.view, helpers.view, pauses.view, transient.client.view, cache.client.view);
    function publish(): void {
        if (stopped) return;
        const value = frame(); document.documentElement.lang = value.copy.locale; document.title = value.copy.messages.title;
        for (const listener of listeners) listener(value);
    }
    const actions: CenterActions = {
        cache: cache.actions,
        sessionPreferences: transient.actions,
        connections: connectionActions(api, document, client, () => !stopped && !cache.client.held && !pauseHeld() && !historyHeld() && ['connections', 'repositories'].includes(navigation.location.route), value => { navigation.dirty(value); publish(); }),
        history: { read: kind => { if (historyVisible()) void history.reader.read(kind); },
            preview: (kind, action) => { void history.reviews.preview('collection', kind, action); }, clear: kind => { void history.reviews.preview('clear', kind); },
            confirm: () => { void history.reviews.confirm(); }, cancel: () => { void history.reviews.cancel(); }, inspect: () => { void history.reviews.inspect(); }, dismiss: () => { void history.reviews.dismiss(); },
            previewExport: kind => { history.exports.preview(kind); }, cancelExport: () => history.exports.invalidate(), downloadExport: () => { void history.exports.download(); } },
        pauses: { read: () => readPauses(), preview: (intent, revision) => { void pauses.reviews.preview(intent, revision); }, confirm: () => { void pauses.reviews.confirm(); },
            cancel: () => { void pauses.reviews.cancel(); }, inspect: () => { void pauses.reviews.inspect(); }, dismiss: () => { void pauses.reviews.dismiss(); } },
        preview: (intent, revision) => { if (!cache.client.held && !historyHeld() && !pauseHeld()) void client.preview(intent, revision); },
        confirm: () => { void client.confirm(); }, cancel: () => { void client.cancel(); },
        dismiss: () => { void client.dismiss(); }, reload: () => { retireObservations(); readPauses(); void client.refresh().then(readObservations); },
        takeControl: () => { operation.clear(); void client.takeControl(); }, dirty: value => { navigation.dirty(value); publish(); },
        stay: () => navigation.stay(), leave: () => {
            if (!cache.client.busy && client.view.phase !== 'committing' && !history.view.busy && !history.view.exportBusy && !pauses.view.busy && !transient.client.view.busy) void history.reviews.dismiss().then(async accepted => {
                if (!accepted || !await cache.client.dismiss() || !await pauses.reviews.dismiss() || !await transient.client.reviews.dismiss()) return; history.exports.invalidate(); await client.dismiss(); if (!stopped) navigation.leave();
            });
        },
        focusContent: () => { document.querySelector<HTMLElement>('main')?.focus(); },
        browseInventory: value => { inventory = value; publish(); },
        inspectPermissions: () => readPermissions(),
        inspectOperation: () => { void operation.read(); },
        inspectHelpers: () => { void helpers.read(); },
        inspectConnection: () => { if (!stopped && focused && document.visibilityState !== 'hidden' && navigation.location.route === 'privacy') void client.connections(); },
        exportSettings: async () => downloadCenterSettings(document, client.view.data?.settings ?? null),
        importSettings: async revision => {
            const origin = navigation.location; const epoch = draftEpoch; const generation = ++importGeneration;
            const settings = await readCenterImport(document);
            if (!settings || stopped || cache.client.held || historyHeld() || pauseHeld() || origin !== navigation.location || epoch !== draftEpoch || generation !== importGeneration) return false;
            await client.preview({ type: 'import', settings }, revision); return true;
        },
    };
    let operationRole: typeof client.view.role;
    let priorSettingsReview = client.view.review;
    const unsubscribe = client.subscribe(view => {
        if (view.role !== operationRole) { operationRole = view.role; pauses.contextChanged(); readPauses(); transient.contextChanged(); cache.contextChanged(); if (view.role === 'editor' || view.role === 'observer') { void operation.read(); void helpers.read(); } }
        if (view.role === null || view.issue === 'incompatible') { operation.clear(); helpers.invalidate(); pauses.contextChanged(); transient.contextChanged(); cache.contextChanged(); history.reader.invalidate(); }
        if (view.role === null || view.role === 'observer' || view.issue === 'incompatible') history.reviews.retire();
        if (view.issue === 'incompatible') history.reader.invalidate();
        protect();
        if (view.review?.state === 'saved' && savedRevision < view.review.revision + 1) savedCandidate = { ...view.review.after, revision: view.review.revision + 1 };
        if (savedCandidate && view.data?.settings && sameSettingsContent(savedCandidate, view.data.settings)) {
            savedRevision = savedCandidate.revision; savedCandidate = null; draftEpoch++; navigation.dirty(false);
        }
        publish();
        if (connectionReadPending && view.phase === 'ready' && !view.review) queueMicrotask(() => {
            if (stopped || !connectionReadPending || client.view.phase !== 'ready' || client.view.review) return;
            connectionReadPending = false; readConnections();
        });
        if (view.review?.state === 'preview' && view.review !== priorSettingsReview) focus('#settings-review-heading');
        priorSettingsReview = view.review;
    });
    let priorHistoryReview: HistoryReview | null = null; let refreshedHistory: HistoryReview | null = null; let priorExport = history.view.exportReview;
    const unhistory = history.subscribe(view => {
        protect(); publish();
        if (view.review && view.review !== priorHistoryReview) focus('#history-review-heading'); priorHistoryReview = view.review;
        if (view.exportReview && view.exportReview !== priorExport) focus('#history-export-heading'); priorExport = view.exportReview;
        if (view.review?.outcome?.state === 'settled' && view.review !== refreshedHistory) { refreshedHistory = view.review; void client.refresh(); }
    });
    let priorPauseReview = pauses.view.review;
    const unpauses = pauses.subscribe(view => {
        protect(); publish();
        if (view.review && view.review !== priorPauseReview && !['committing', 'cancelling'].includes(view.review.phase)) focus('#pause-review-heading');
        priorPauseReview = view.review;
    });
    transient.start();
    const surface: CenterSurface = { initial: frame(), actions, load: loadCenterPage, loadInventory: loadInventoryPage, loadPrivacy: loadPrivacyPage, loadSupport: loadSupportPage, loadHistory: loadHistoryPage, loadPauses: loadPausesPage, loadSessionPreferences: loadSessionPreferencesPage,
        subscribe: listener => subscribeCenterRecoveryFocus({ initial: frame(), subscribe: sink => {
            listeners.add(sink); sink(frame()); return () => { listeners.delete(sink); };
        } }, () => document.querySelector<HTMLElement>('.center'), listener) };
    const host = mount(CenterHost, { target: document.body, props: { surface } }); flushSync();
    function readConnections(): void {
        const route = navigation.location.route;
        if (route === 'repositories' && ['pauses', 'session'].includes(navigation.location.detail ?? '')) return;
        if (route === 'features' && currentCenterSettings(client.view) === null) return;
        if (['connections', 'repositories', 'profiles', 'features'].includes(route)) void client.connections();
    }
    function readPermissions(): void { if (!stopped && focused && document.visibilityState !== 'hidden' && navigation.location.route === 'privacy') inspector.read(); }
    function pauseVisible(): boolean { return !stopped && focused && document.visibilityState !== 'hidden' && navigation.location.route === 'repositories'
        && navigation.location.detail === 'pauses' && (client.view.role === 'editor' || client.view.role === 'observer') && client.view.issue !== 'incompatible'; }
    function readPauses(): void { if (pauseVisible()) void pauses.reader.read(); }
    function historyVisible(): boolean { return !stopped && focused && document.visibilityState !== 'hidden' && ['activity', 'diagnostics', 'privacy'].includes(navigation.location.route); }
    function observeDestination(): void {
        if (!stopped && focused && document.visibilityState !== 'hidden' && navigation.location !== deliveredLocation
            && client.observeDestination(navigation.location)) deliveredLocation = navigation.location;
    }
    function readHistory(): void { if (historyVisible()) { void history.reader.read('diagnostics'); if (navigation.location.route !== 'diagnostics') void history.reader.read('recents'); } }
    function readObservations(): void { readConnections(); readPermissions(); readHistory(); readPauses(); transient.read(); void operation.read(); void helpers.read(); }
    function retireObservations(): void { helpers.invalidate(); operation.invalidate(); client.invalidateConnections(); inspector.invalidate(); history.reader.invalidate(); pauses.reader.invalidate(); transient.client.reader.invalidate(); }
    const hash = () => navigation.navigate(window.location.hash);
    const visible = () => {
        if (stopped) return;
        retireObservations();
        readPauses();
        transient.read();
        if (focused && document.visibilityState !== 'hidden') { connectionReadPending = true; void client.refreshActive().then(() => { readHistory(); void operation.read(); void helpers.read(); }); readPermissions(); }
    };
    const blurred = () => { focused = false; retireObservations(); };
    const foreground = () => { focused = true; visible(); };
    const unobservePermissions = permissionReader.observe(visible);
    const changed = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && Object.hasOwn(changes, SETTINGS_KEY)) visible(); };
    const invalidated: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender) => {
        if (sender.id !== api.runtime.id || sender.tab) return;
        const target = pauseTargetInvalidation(value);
        if (target) { if (target.retired) pauses.reviews.invalidateTab(target.tabId); pauses.reader.invalidate(); readPauses(); return; }
        if (sender.id !== api.runtime.id || sender.tab || !record(value) || !keys(value, ['version', 'method']) || value.version !== 1) return;
        if (value.method === 'center.invalidated') { history.reviews.retire(); visible(); }
        if (value.method === 'center.history.invalidated') { void client.refreshVisitCapture(); history.reader.invalidate(); readHistory(); operation.invalidate(); void operation.read(); helpers.invalidate(); void helpers.read(); }
        if (value.method === 'center.health.invalidated') { helpers.invalidate(); void helpers.read(); }
        if (value.method === 'center.operation.invalidated') { operation.invalidate(); void operation.read(); }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (navigation.guarded) { event.preventDefault(); event.returnValue = ''; } };
    const stop = () => {
        if (stopped) return;
        stopped = true; inspector.stop(); unobservePermissions(); unsubscribe(); unhistory(); unpauses(); history.stop(); pauses.stop(); transient.stop(); cache.stop(); operation.stop(); helpers.stop(); client.stop(); channel.stop(); listeners.clear(); void unmount(host);
        window.removeEventListener('hashchange', hash); document.removeEventListener('visibilitychange', visible);
        window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', stop);
        window.removeEventListener('blur', blurred); window.removeEventListener('focus', foreground);
        api.storage.onChanged.removeListener(changed); api.runtime.onMessage.removeListener(invalidated);
    };
    window.addEventListener('hashchange', hash); document.addEventListener('visibilitychange', visible);
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('pagehide', stop);
    window.addEventListener('blur', blurred); window.addEventListener('focus', foreground);
    api.storage.onChanged.addListener(changed); api.runtime.onMessage.addListener(invalidated);
    readPermissions(); void client.start().then(() => { readConnections(); readHistory(); transient.read(); void client.startVisitCapture().then(observeDestination); }); return stop;
}
