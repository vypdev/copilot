import type { FeatureController, ResourceScope, RuntimeContext } from '../../application/runtime_ports.ts';
import type { BrowserApi } from '../browser/api.ts';
import { record } from '../../domain/value.ts';
import type { RuntimeExplanation } from '../../domain/runtime_explanation.ts';
import { runtimeExplanation } from './runtime_explanation.ts';

type FocusTarget = 'heading' | 'read' | 'inspect' | 'settings' | 'explanation' | 'features' | 'technical';
export interface RuntimePanelViewState { readonly target: FocusTarget | null; readonly explanationOpen: boolean; readonly featuresOpen: boolean; readonly technicalOpen: boolean }
export interface RuntimePanelController extends FeatureController { captureViewState(): RuntimePanelViewState | null; restoreViewState(state: RuntimePanelViewState): void }
/** Only extension-created nodes are written or removed. Native editors are never inspected. */
export function mountRuntimePanel(context: RuntimeContext, scope: ResourceScope, api: BrowserApi,
    document: Document, copy: { title: string; standalone: string; read: string; settings: string; pending: string; unavailable: string; details: string; sourceTree?: string; ready?: boolean; readable: boolean; explanation: RuntimeExplanation; check: string; checking: boolean },
    present: (state: string, retryAt?: unknown) => string, observed: () => { viewer: string | null; repositoryId: string },
    inspectConfiguration: () => void,
    openSettings: () => Promise<unknown> = () => api.runtime.sendMessage({ version: 1, method: 'settings.open' })): RuntimePanelController {
    const anchor = document.querySelector('main');
    const existing = document.querySelector('[data-copilot-runtime]');
    if (!anchor || existing) return { refresh() {}, dispose() {}, captureViewState: () => null, restoreViewState() {} };
    const panel = document.createElement('section'); panel.dataset.copilotRuntime = '1'; panel.dataset.copilotSettings = copy.ready === false ? 'unavailable' : 'ready'; panel.dataset.copilotSourceTree = copy.sourceTree ?? 'unbundled';
    panel.dataset.copilotDensity = context.settings.density;
    panel.style.padding = context.settings.density === 'compact' ? '0.5rem' : '1rem';
    panel.style.colorScheme = context.settings.theme === 'github' ? 'normal' : context.settings.theme;
    panel.setAttribute('aria-label', copy.title);
    const heading = document.createElement('h2'); heading.textContent = copy.title; heading.tabIndex = -1;
    const canRead = () => copy.ready !== false && copy.readable;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.textContent = copy.standalone;
    const read = document.createElement('button'); read.type = 'button'; read.textContent = copy.read; read.disabled = !canRead();
    const settings = document.createElement('button'); settings.type = 'button'; settings.dataset.copilotOpenSettings = '1'; settings.textContent = copy.settings;
    const check = document.createElement('button'); check.type = 'button'; check.dataset.copilotInspectConfiguration = '1'; check.textContent = copy.check; check.disabled = copy.checking;
    const evidence = document.createElement('p');
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = copy.details;
    const digest = document.createElement('code'); digest.textContent = `SHA-256 ${copy.sourceTree ?? 'unbundled'}`; details.append(summary, digest);
    const explanation = runtimeExplanation(document, copy.explanation, scope);
    panel.append(heading, status, evidence, read, document.createTextNode(' '), check, document.createTextNode(' '), settings, explanation.element, details);
    anchor.append(panel); scope.own(() => panel.remove());
    const targets = new Map<FocusTarget, HTMLElement | null>([['heading', heading], ['read', read], ['inspect', check], ['settings', settings],
        ['explanation', explanation.summary], ['features', explanation.featureSummary], ['technical', summary]]);
    let desiredFocus: FocusTarget | null = null; let pendingFeaturesOpen = false;
    let sequence = 0; let openings = 0;
    const load = async () => {
        if (!scope.current() || !canRead()) return;
        const operation = ++sequence; read.disabled = true; status.textContent = copy.pending;
        try {
            const native = observed();
            const response = await api.runtime.sendMessage({ version: 1, method: 'page.snapshot', route: context.page.route,
                generation: context.epochs.route, repositoryId: native.repositoryId, viewer: native.viewer,
                visible: document.visibilityState === 'visible', manual: true });
            if (!scope.current() || operation !== sequence) return;
            if (!record(response) || typeof response.state !== 'string') { status.textContent = copy.unavailable; return; }
            status.textContent = present(response.state, response.retryAt);
            // API strings are plain text, never Markdown, selectors, HTML or executable links.
            if (response.state === 'current' && record(response.data) && typeof response.data.title === 'string') {
                evidence.textContent = `${context.page.kind === 'pull' ? 'PR' : 'Issue'} #${context.page.number}: ${response.data.title}`;
            } else evidence.textContent = '';
        } catch { if (scope.current() && operation === sequence) status.textContent = copy.unavailable; }
        finally { if (scope.current() && operation === sequence) read.disabled = !canRead(); }
    };
    const open = (event: MouseEvent) => {
        if (!scope.current() || !event.isTrusted || settings.disabled) return;
        const operation = ++openings; const reading = sequence; settings.disabled = true;
        const failed = () => { if (scope.current() && operation === openings && reading === sequence) status.textContent = copy.unavailable; };
        const run = async () => {
            try {
                const response = await openSettings();
                if (!record(response) || response.state !== 'opened') failed();
            } catch { failed(); }
            finally { if (scope.current() && operation === openings) settings.disabled = false; }
        };
        void run();
    };
    settings.addEventListener('click', open); scope.own(() => settings.removeEventListener('click', open));
    const inspect = () => {
        if (!scope.current() || copy.checking || check.disabled) return; check.disabled = true;
        try { inspectConfiguration(); } catch { if (scope.current()) { status.textContent = copy.unavailable; check.disabled = false; } }
    };
    check.addEventListener('click', inspect); scope.own(() => check.removeEventListener('click', inspect));
    const click = () => { void load(); }; read.addEventListener('click', click); scope.own(() => read.removeEventListener('click', click));
    return { captureViewState() {
        if (!panel.isConnected) return null;
        const target = [...targets].find(([, node]) => node !== null && document.activeElement === node)?.[0] ?? null;
        return Object.freeze({ target: target === 'heading' ? desiredFocus ?? target : target,
            explanationOpen: explanation.element.open, featuresOpen: explanation.features?.open ?? pendingFeaturesOpen, technicalOpen: details.open });
    }, restoreViewState(state) {
        if (!scope.current() || !panel.isConnected) return;
        explanation.element.open = state.explanationOpen; pendingFeaturesOpen = state.featuresOpen; if (explanation.features) explanation.features.open = state.featuresOpen; details.open = state.technicalOpen;
        if (state.target === null) return; desiredFocus = state.target;
        const candidate = targets.get(state.target); const target = candidate && !candidate.hasAttribute('disabled') ? candidate : heading;
        target.focus(); if (document.activeElement !== target) heading.focus();
    }, refresh() {
        if (!scope.current()) return;
        const currentAnchor = document.querySelector('main');
        if (currentAnchor && !panel.isConnected && !document.querySelector('[data-copilot-runtime]')) currentAnchor.append(panel);
    }, dispose() { sequence++; } };
}
