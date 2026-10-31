import { buildSourceIdentity } from './build_identity.ts';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { BrowserResourceScope } from '../adapters/browser/resource_scope.ts';
import { mountRuntimePanel, type RuntimePanelController, type RuntimePanelViewState } from '../adapters/dom/runtime_panel.ts';
import { FeatureRuntime } from '../application/lifecycle.ts';
import { pageIdentity } from '../domain/page.ts';
import { DEFAULT_SETTINGS } from '../domain/settings.ts';
import { decodeRuntimeConfiguration, type PageRequest, type RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import { runtimeProvenanceView } from '../presentation/runtime_provenance_view.ts';
import { runtimeAvailability } from '../presentation/runtime_availability.ts';
import { runtimeCopy, statusText } from '../presentation/runtime_copy.ts';
import { record } from '../domain/value.ts';
import { mountShortcuts } from '../adapters/dom/shortcuts.ts';
import { shortcutsCopy } from '../domain/shortcuts_copy.ts';
import { centerCopy } from '../domain/center_copy.ts';
import { RuntimeHealth } from '../domain/runtime_health.ts';
import { snapshotHelperIntent, type HelperSampleIntent } from '../domain/helper_sample.ts';
import type { CenterCommand } from '../domain/shortcuts.ts';

export function startContent(api: BrowserApi, window: Window, document: Document): (() => void) | undefined {
    if (!pageIdentity(window.location.href) || api.extension?.inIncognitoContext === true || window.top !== window.self) return;
    let configuration: RuntimeConfiguration | null = null; let enabled = false; let stopped = false;
    let generation = 0; let credentialEpoch = 0; let loading = 0; let scopeKey = ''; let configurationEpoch = 0; let configurationPending = false;
    let panel: RuntimePanelController | null = null; let nextPanelView: RuntimePanelViewState | null = null; let paintedConfigurationEpoch = -1;
    const health = new RuntimeHealth(['runtime-health', 'center-shortcuts']);
    const failuresInSource = new Set<string>();
    let observer: MutationObserver | undefined; let observed: (Node | null)[] = [];
    const native = () => ({ repositoryId: document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_id"]')?.content ?? '',
        viewer: document.querySelector<HTMLMetaElement>('meta[name="user-login"]')?.content || null });
    const observation = () => {
        const page = pageIdentity(window.location.href, document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-issue_id"]')?.content ?? '');
        const identity = native();
        return { page, identity, key: JSON.stringify([page?.route, page?.object, identity.repositoryId, identity.viewer]) };
    };
    const openCenter = (command?: CenterCommand): Promise<unknown> => {
        const sourceTree = buildSourceIdentity(); let intent: HelperSampleIntent = { state: 'unavailable', sourceTree };
        try {
            if (!stopped && document.visibilityState === 'visible' && configuration && scopeKey === observation().key)
                intent = { state: 'ready', sourceTree, generation: configuration.generation, credentialEpoch: configuration.epoch,
                    settingsRevision: configuration.settings.revision, health: health.snapshot() as Extract<HelperSampleIntent, { state: 'ready' }>['health'] };
        } catch { /* Preserve a closed unavailable sample without raw reasons or a hidden-page query. */ }
        const sample = snapshotHelperIntent(intent) ?? snapshotHelperIntent({ state: 'unavailable', sourceTree });
        return api.runtime.sendMessage({ version: 1, method: 'settings.open', ...(command === undefined ? {} : { command }), ...(sample ? { health: sample } : {}) });
    };
    const runtime = new FeatureRuntime([{ id: 'runtime-health', purpose: 'local-control', enabled: () => health.canMount('runtime-health'),
        mount: (context, scope) => {
            const copy = { ...runtimeCopy(context.settings.locale === 'auto' ? window.navigator.language : context.settings.locale), sourceTree: buildSourceIdentity() };
            const locale = context.settings.locale === 'auto' ? window.navigator.language : context.settings.locale; const online = window.navigator.onLine !== false;
            const explanation = runtimeProvenanceView(configuration, locale, online); const availability = runtimeAvailability(configuration, configurationPending, online, locale);
            const mounted = mountRuntimePanel(context, scope, api, document, { ...copy, ready: enabled, checking: configurationPending, explanation, readable: availability.readable,
                standalone: availability.status }, (state, retryAt) => statusText(state, copy, retryAt, undefined, locale), native, () => reconcile(true, true), () => openCenter());
            if (nextPanelView) { mounted.restoreViewState(nextPanelView); nextPanelView = null; } panel = mounted; return mounted;
        } }, { id: 'center-shortcuts', enabled: context => enabled && health.canMount('center-shortcuts') && context.settings.shortcuts && context.settings.features['BEX-CENTER-07'],
        mount: (context, scope) => mountShortcuts(context, scope, window, document, async command => {
            const response = await openCenter(command);
            return record(response) && response.state === 'opened' && response.sourceTree === buildSourceIdentity();
        }, shortcutsCopy(centerCopy(context.settings.locale, window.navigator.language).locale)) }],
    { scope: valid => new BrowserResourceScope(valid), diagnostic: (id, code, current) => { if (!stopped) { health.record(id, code, current); if (current) failuresInSource.add(id); } } });
    const release = () => {
        if (generation && scopeKey) void api.runtime.sendMessage({ version: 1, method: 'page.release', generation }).catch(() => undefined);
        loading++; configurationEpoch++; configurationPending = false; configuration = null; enabled = false; scopeKey = ''; runtime.dispose(); failuresInSource.clear(); panel = null; nextPanelView = null; paintedConfigurationEpoch = -1;
    };
    const paint = () => {
        const { page, identity } = observation();
        // Only reconcile/current() call this synchronously after admitting this exact observation.
        const settings = configuration?.settings ?? { ...DEFAULT_SETTINGS, bindings: DEFAULT_SETTINGS.center.bindings };
        if (panel && configurationEpoch !== paintedConfigurationEpoch) nextPanelView = panel.captureViewState(); paintedConfigurationEpoch = configurationEpoch;
        void runtime.update({ page: page!, settings, repositoryId: identity.repositoryId,
            epochs: { route: generation, object: generation, settings: settings.revision, credential: credentialEpoch }, paused: settings.paused, configurationEpoch });
    };
    const watch = () => {
        const nodes = [document.head, document.querySelector('#js-repo-pjax-container') ?? document.querySelector('main')?.parentElement ?? null,
            ...['octolytics-dimension-repository_id', 'octolytics-dimension-issue_id', 'user-login'].map(name => document.querySelector(`meta[name="${name}"]`))];
        if (nodes.every((node, index) => node === observed[index])) return;
        observer?.disconnect(); observed = nodes;
        observer = new MutationObserver(() => reconcile());
        for (const node of nodes.slice(0, 2)) if (node) observer.observe(node, { childList: true, subtree: false });
        for (const node of nodes.slice(2)) if (node) observer.observe(node, { attributes: true, attributeFilter: ['content'] });
    };
    const load = async (request: PageRequest, key: string, operation: number) => {
        const current = () => !stopped && operation === loading && document.visibilityState === 'visible'
            && observation().key === key && observation().page !== null;
        try {
            const response = await api.runtime.sendMessage(request);
            if (!current()) return;
            configuration = decodeRuntimeConfiguration(response, request, buildSourceIdentity()); enabled = configuration !== null; configurationPending = false; configurationEpoch++;
            if (configuration) health.resetFailures(failuresInSource); paint();
        } catch { if (current()) { enabled = false; configurationPending = false; configurationEpoch++; paint(); } }
    };
    const reconcile = (force = false, inspectOnly = false) => {
        if (stopped) return;
        const { page, identity, key } = observation();
        if (!page || document.visibilityState !== 'visible') {
            release(); observer?.disconnect(); observed = []; return;
        }
        watch();
        if (force || key !== scopeKey) {
            const view = key === scopeKey ? panel?.captureViewState() ?? null : null;
            release(); scopeKey = key; generation++; nextPanelView = view;
            const operation = loading; configurationPending = true; paint();
            void load({ version: 1, method: 'page.configuration', route: page.route, generation,
                repositoryId: identity.repositoryId, viewer: identity.viewer, visible: true, manual: false, ...(inspectOnly ? { inspectOnly: true } : {}) }, key, operation);
        } else paint();
    };
    const event = (hint: Event) => reconcile(hint.type === 'online' || hint.type === 'offline');
    const visibility = () => reconcile(true);
    const invalidated: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender, respond) => {
        if (stopped || sender.id !== api.runtime.id || sender.tab !== undefined || !record(value) || value.version !== 1 || Object.keys(value).length !== 2) return;
        if (value.method === 'runtime.health') {
            let response: unknown = { sourceTree: buildSourceIdentity(), state: 'unavailable' };
            try {
                const current = document.visibilityState === 'visible' && configuration !== null && pageIdentity(window.location.href) !== null && scopeKey === observation().key;
                if (current) response = { sourceTree: buildSourceIdentity(), state: 'ready', health: health.snapshot() };
            } catch { /* A closed native context cannot certify current health. */ }
            try { respond(response); } catch { /* Never deliver a second response or change another feature after a failed acknowledgement. */ }
        } else if (value.method === 'runtime.invalidated') { credentialEpoch++; reconcile(true); }
        else if (value.method === 'runtime.cache.invalidated') { credentialEpoch++; reconcile(true, true); }
    };
    const events = ['popstate', 'hashchange', 'pageshow', 'online', 'offline', 'turbo:load', 'turbo:render', 'pjax:end'];
    for (const name of events) window.addEventListener(name, event);
    document.addEventListener('visibilitychange', visibility); api.runtime.onMessage.addListener(invalidated);
    reconcile();
    return () => { if (stopped) return; stopped = true; release(); health.clear(); observer?.disconnect();
        for (const name of events) window.removeEventListener(name, event);
        document.removeEventListener('visibilitychange', visibility); api.runtime.onMessage.removeListener(invalidated); };
}
