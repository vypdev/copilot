import type { FeatureController, ResourceScope, RuntimeContext } from '../../application/runtime_ports.ts';
import type { BrowserApi } from '../browser/api.ts';
import { record } from '../../domain/value.ts';

/** Only extension-created nodes are written or removed. Native editors are never inspected. */
export function mountRuntimePanel(context: RuntimeContext, scope: ResourceScope, api: BrowserApi,
    document: Document, copy: { title: string; standalone: string; read: string; settings: string; pending: string; unavailable: string; details: string; sourceTree?: string; ready?: boolean },
    present: (state: string, retryAt?: unknown) => string, observed: () => { viewer: string | null; repositoryId: string }): FeatureController {
    const anchor = document.querySelector('main');
    const existing = document.querySelector('[data-copilot-runtime]');
    if (!anchor || existing) return { refresh() {}, dispose() {} };
    const panel = document.createElement('section'); panel.dataset.copilotRuntime = '1'; panel.dataset.copilotSettings = copy.ready === false ? 'unavailable' : 'ready'; panel.dataset.copilotSourceTree = copy.sourceTree ?? 'unbundled';
    panel.setAttribute('aria-label', copy.title);
    const heading = document.createElement('h2'); heading.textContent = copy.title;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.textContent = copy.standalone;
    const read = document.createElement('button'); read.type = 'button'; read.textContent = copy.read; read.disabled = copy.ready === false;
    const settings = document.createElement('a'); settings.href = api.runtime.getURL('runtime.html'); settings.textContent = copy.settings;
    const evidence = document.createElement('p');
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = copy.details;
    const digest = document.createElement('code'); digest.textContent = `SHA-256 ${copy.sourceTree ?? 'unbundled'}`; details.append(summary, digest);
    panel.append(heading, status, evidence, read, document.createTextNode(' '), settings, details);
    anchor.append(panel); scope.own(() => panel.remove());
    let sequence = 0;
    const load = async () => {
        if (!scope.current()) return;
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
        } catch { if (scope.current()) status.textContent = copy.unavailable; }
        finally { if (scope.current() && operation === sequence) read.disabled = false; }
    };
    const click = () => { void load(); }; read.addEventListener('click', click); scope.own(() => read.removeEventListener('click', click));
    return { refresh() {
        if (!scope.current()) return;
        const currentAnchor = document.querySelector('main');
        if (currentAnchor && !panel.isConnected && !document.querySelector('[data-copilot-runtime]')) currentAnchor.append(panel);
    }, dispose() { sequence++; } };
}
