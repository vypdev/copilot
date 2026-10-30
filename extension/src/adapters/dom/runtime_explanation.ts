import type { RuntimeExplanation } from '../../domain/runtime_explanation.ts';
import type { ResourceScope } from '../../application/runtime_ports.ts';

/** Closed text only, written to extension-owned nodes. Rendering performs no read, write or navigation. */
export function runtimeExplanation(document: Document, view: RuntimeExplanation, scope: Pick<ResourceScope, 'current' | 'own'>): {
    readonly element: HTMLDetailsElement; readonly summary: HTMLElement; readonly features: HTMLDetailsElement | null; readonly featureSummary: HTMLElement | null;
} {
    const text = (tag: keyof HTMLElementTagNameMap, value: string) => { const node = document.createElement(tag); node.textContent = value; return node; };
    const details = document.createElement('details'); details.dataset.copilotProvenance = '1'; const summary = text('summary', view.title); details.append(summary, text('p', view.summary));
    let featureDetails: HTMLDetailsElement | null = null; let featureSummary: HTMLElement | null = null;
    const rows = (values: RuntimeExplanation['rows']) => {
        const list = document.createElement('dl');
        for (const row of values) list.append(text('dt', row.label), text('dd', row.source ? `${row.value} · ${row.source}` : row.value));
        return list;
    };
    details.append(rows(view.rows));
    if (view.scopes.length) details.append(text('h3', view.scopeTitle), rows(view.scopes));
    if (view.pauses.length) { const list = document.createElement('ul'); for (const pause of view.pauses) list.append(text('li', pause)); details.append(text('h3', view.pausesTitle), list); }
    if (view.features.length) {
        const features = document.createElement('details'); features.dataset.copilotPreferenceSources = '1'; const list = document.createElement('ul');
        let populated = false;
        const populate = () => {
            if (!features.open || populated || !scope.current()) return; populated = true;
            for (const feature of view.features) { const row = document.createElement('li'); row.dataset.copilotPreference = feature.id; row.append(text('strong', feature.label), text('span', ` · ${feature.value} · ${feature.source}`)); list.append(row); }
        };
        features.addEventListener('toggle', populate); scope.own(() => features.removeEventListener('toggle', populate));
        featureSummary = text('summary', view.featuresTitle); featureDetails = features;
        features.append(featureSummary, text('p', view.featuresHint), list); details.append(features);
    }
    return { element: details, summary, features: featureDetails, featureSummary };
}
