import { buildSourceIdentity } from './build_identity.ts';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { BrowserResourceScope } from '../adapters/browser/resource_scope.ts';
import { mountRuntimePanel } from '../adapters/dom/runtime_panel.ts';
import { FeatureRuntime } from '../application/lifecycle.ts';
import { pageIdentity } from '../domain/page.ts';
import { DEFAULT_SETTINGS } from '../domain/settings.ts';
import { decodeRuntimeConfiguration, type PageRequest, type RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import { runtimeCopy, statusText } from '../presentation/runtime_copy.ts';
import { record } from '../domain/value.ts';
import { mountShortcuts } from '../adapters/dom/shortcuts.ts';
import { shortcutsCopy } from '../domain/shortcuts_copy.ts';
import { centerCopy } from '../domain/center_copy.ts';

export function startContent(api: BrowserApi, window: Window, document: Document): (() => void) | undefined {
    if (!pageIdentity(window.location.href) || api.extension?.inIncognitoContext === true || window.top !== window.self) return;
    let configuration: RuntimeConfiguration | null = null; let enabled = false; let stopped = false;
    let generation = 0; let credentialEpoch = 0; let loading = 0; let scopeKey = '';
    let observer: MutationObserver | undefined; let observed: (Node | null)[] = [];
    const native = () => ({ repositoryId: document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_id"]')?.content ?? '',
        viewer: document.querySelector<HTMLMetaElement>('meta[name="user-login"]')?.content || null });
    const observation = () => {
        const page = pageIdentity(window.location.href, document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-issue_id"]')?.content ?? '');
        const identity = native();
        return { page, identity, key: JSON.stringify([page?.route, page?.object, identity.repositoryId, identity.viewer]) };
    };
    const runtime = new FeatureRuntime([{ id: 'runtime-health', enabled: () => true,
        mount: (context, scope) => {
            const copy = { ...runtimeCopy(context.settings.locale === 'auto' ? window.navigator.language : context.settings.locale), sourceTree: buildSourceIdentity() };
            const connected = configuration !== null && configuration.connected;
            return mountRuntimePanel(context, scope, api, document, { ...copy, ready: enabled,
                standalone: !enabled ? copy.unavailable : connected ? copy.connected : copy.standalone }, (state, retryAt) => statusText(state, copy, retryAt), native);
        } }, { id: 'center-shortcuts', enabled: context => enabled && context.settings.shortcuts && context.settings.features['BEX-CENTER-07'],
        mount: (context, scope) => mountShortcuts(context, scope, window, document, async command => {
            const response = await api.runtime.sendMessage({ version: 1, method: 'settings.open', command });
            return record(response) && response.state === 'opened' && response.sourceTree === buildSourceIdentity();
        }, shortcutsCopy(centerCopy(context.settings.locale, window.navigator.language).locale)) }],
    { scope: valid => new BrowserResourceScope(valid), diagnostic: () => { enabled = false; } });
    const release = () => {
        if (generation && scopeKey) void api.runtime.sendMessage({ version: 1, method: 'page.release', generation }).catch(() => undefined);
        loading++; configuration = null; enabled = false; scopeKey = ''; runtime.dispose();
    };
    const paint = () => {
        const { page, identity } = observation();
        // Only reconcile/current() call this synchronously after admitting this exact observation.
        const settings = configuration?.settings ?? { ...DEFAULT_SETTINGS, bindings: DEFAULT_SETTINGS.center.bindings };
        void runtime.update({ page: page!, settings, repositoryId: identity.repositoryId,
            epochs: { route: generation, object: generation, settings: settings.revision, credential: credentialEpoch }, paused: settings.paused });
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
            configuration = decodeRuntimeConfiguration(response, request, buildSourceIdentity()); enabled = configuration !== null; paint();
        } catch { if (current()) { enabled = false; paint(); } }
    };
    const reconcile = (force = false) => {
        if (stopped) return;
        const { page, identity, key } = observation();
        if (!page || document.visibilityState !== 'visible') {
            release(); observer?.disconnect(); observed = []; return;
        }
        watch();
        if (force || key !== scopeKey) {
            release(); scopeKey = key; generation++;
            const operation = loading;
            void load({ version: 1, method: 'page.configuration', route: page.route, generation,
                repositoryId: identity.repositoryId, viewer: identity.viewer, visible: true, manual: false }, key, operation);
        } else paint();
    };
    const event = (hint: Event) => reconcile(hint.type === 'online' || hint.type === 'offline');
    const visibility = () => reconcile(true);
    const invalidated: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender) => {
        if (sender.id === api.runtime.id && sender.tab === undefined && record(value) && value.version === 1
            && value.method === 'runtime.invalidated' && Object.keys(value).length === 2) { credentialEpoch++; reconcile(true); }
    };
    const events = ['popstate', 'hashchange', 'pageshow', 'online', 'offline', 'turbo:load', 'turbo:render', 'pjax:end'];
    for (const name of events) window.addEventListener(name, event);
    document.addEventListener('visibilitychange', visibility); api.runtime.onMessage.addListener(invalidated);
    reconcile();
    return () => { if (stopped) return; stopped = true; release(); observer?.disconnect();
        for (const name of events) window.removeEventListener(name, event);
        document.removeEventListener('visibilitychange', visibility); api.runtime.onMessage.removeListener(invalidated); };
}
