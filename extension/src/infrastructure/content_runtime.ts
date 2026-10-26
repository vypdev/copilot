import { buildSourceIdentity } from './build_identity.ts';
import type { BrowserApi } from '../adapters/browser/api.ts';
import { BrowserResourceScope } from '../adapters/browser/resource_scope.ts';
import { mountRuntimePanel } from '../adapters/dom/runtime_panel.ts';
import { FeatureRuntime } from '../application/lifecycle.ts';
import { pageIdentity } from '../domain/page.ts';
import { DEFAULT_SETTINGS, effectiveSettings, loadSettings, type Settings } from '../domain/settings.ts';
import { runtimeCopy, statusText } from '../presentation/runtime_copy.ts';
import { record } from '../domain/value.ts';

export function startContent(api: BrowserApi, window: Window, document: Document): (() => void) | undefined {
    if (!pageIdentity(window.location.href) || api.extension?.inIncognitoContext === true || window.top !== window.self) return;
    let settings: Settings = DEFAULT_SETTINGS; let enabled = true; let stopped = false;
    let routeEpoch = 0; let objectEpoch = 0; let credentialEpoch = 0;
    let previousRoute = ''; let previousObject = ''; let loading = 0;
    let observer: MutationObserver | undefined; let observedRoot: Element | null = null;
    const diagnostic = () => { enabled = false; };
    const native = () => ({ repositoryId: document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_id"]')?.content ?? '',
        viewer: document.querySelector<HTMLMetaElement>('meta[name="user-login"]')?.content || null });
    const runtime = new FeatureRuntime([{ id: 'runtime-health', enabled: () => true,
        mount: (context, scope) => {
            const copy = { ...runtimeCopy(context.settings.locale === 'auto' ? window.navigator.language : context.settings.locale), sourceTree: buildSourceIdentity() };
            return mountRuntimePanel(context, scope, api, document, { ...copy, ready: enabled, standalone: enabled ? copy.standalone : copy.unavailable }, state => statusText(state, copy), native);
        } }],
    { scope: valid => new BrowserResourceScope(valid), diagnostic });
    const update = () => {
        if (stopped) return;
        if (document.visibilityState === 'hidden') { runtime.dispose(); observer?.disconnect(); observedRoot = null; return; }
        const page = pageIdentity(window.location.href,
            document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-issue_id"]')?.content ?? '');
        if (!page) { routeEpoch++; previousRoute = ''; previousObject = ''; observer?.disconnect(); observer = undefined;
            observedRoot = null; runtime.dispose(); return; }
        if (page.route !== previousRoute) { routeEpoch++; previousRoute = page.route; }
        if (page.object !== previousObject) { objectEpoch++; previousObject = page.object; }
        const root = document.querySelector('#js-repo-pjax-container') ?? document.querySelector('main')?.parentElement ?? null;
        if (root !== observedRoot) {
            observer?.disconnect(); observedRoot = root;
            if (root) {
                observer = new MutationObserver(() => {
                    // Constant work: reconcile the scoped anchor; never inspect native editors.
                    update();
                });
                observer.observe(root, { childList: true, subtree: false });
            }
        }
        const effective = effectiveSettings(settings, native().repositoryId, false, false);
        void runtime.update({ page, settings, repositoryId: native().repositoryId,
            epochs: { route: routeEpoch, object: objectEpoch, settings: settings.revision, credential: credentialEpoch }, paused: effective.paused });
    };
    const reload = async () => {
        const operation = ++loading;
        if (!pageIdentity(window.location.href)) { update(); return; }
        try {
            const response = await api.runtime.sendMessage({ version: 1, method: 'settings.read' });
            if (stopped || operation !== loading || !pageIdentity(window.location.href)) return;
            const loaded = record(response) && response.state === 'ready' ? loadSettings(response.settings) : null;
            enabled = loaded?.state === 'ready'; settings = loaded?.settings ?? DEFAULT_SETTINGS; update();
        } catch { if (!stopped && operation === loading) { enabled = false; update(); } }
    };
    const event = () => { update(); };
    const visibility = () => { if (document.visibilityState === 'hidden') {
        if (pageIdentity(window.location.href)) void api.runtime.sendMessage({ version: 1, method: 'page.release', generation: routeEpoch }).catch(() => undefined);
        runtime.dispose(); observer?.disconnect(); observedRoot = null; }
        else { update(); void reload(); } };
    const invalidated: Parameters<typeof api.runtime.onMessage.addListener>[0] = (value, sender) => {
        if (sender.id === api.runtime.id && record(value) && value.version === 1 && value.method === 'runtime.invalidated'
            && Object.keys(value).length === 2) { credentialEpoch++; runtime.dispose(); void reload(); }
    };
    const events = ['popstate', 'hashchange', 'pageshow', 'turbo:load', 'turbo:render', 'pjax:end'];
    for (const name of events) window.addEventListener(name, event);
    document.addEventListener('visibilitychange', visibility); api.runtime.onMessage.addListener(invalidated);
    void reload();
    return () => { if (stopped) return; stopped = true; loading++; runtime.dispose(); observer?.disconnect();
        for (const name of events) window.removeEventListener(name, event);
        document.removeEventListener('visibilitychange', visibility); api.runtime.onMessage.removeListener(invalidated); };
}
