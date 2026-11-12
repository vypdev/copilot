import type { AgentConfiguration } from '../../domain/agent';

/** Reads the exact backend/model record, never a similarly named model or the provider default. */
export function inspectOpenCodeVerifierCatalog(
    catalog: string, configuration: Readonly<AgentConfiguration>,
): 'provider-model-unavailable' | 'provider-effort-unsupported' | 'provider-catalog-unavailable' | undefined {
    const lines = catalog.split(/\r?\n/u);
    const header = `${configuration.modelProvider ?? 'openai'}/${configuration.model}`;
    const matches = lines.flatMap((line, index) => line.trim() === header ? [index] : []);
    if (!matches.length) return catalog.trim() ? 'provider-model-unavailable' : 'provider-catalog-unavailable';
    if (matches.length !== 1) return 'provider-catalog-unavailable';
    const first = matches[0] + 1;
    const last = lines.indexOf('}', first);
    if (last < first) return 'provider-catalog-unavailable';
    try {
        const model = JSON.parse(lines.slice(first, last + 1).join('\n')) as {
            id?: unknown; providerID?: unknown; variants?: unknown;
        };
        if (model.id !== configuration.model || model.providerID !== (configuration.modelProvider ?? 'openai')) {
            return 'provider-catalog-unavailable';
        }
        if (configuration.effort && (model.variants === null || typeof model.variants !== 'object'
            || !Object.prototype.hasOwnProperty.call(model.variants, configuration.effort))) return 'provider-effort-unsupported';
    } catch {
        return 'provider-catalog-unavailable';
    }
    return undefined;
}

/** Cursor's catalog presents model identifiers before the display label. */
export function inspectCursorVerifierCatalog(
    catalog: string, model: string,
): 'provider-model-unavailable' | 'provider-catalog-unavailable' | undefined {
    const ids = catalog.split(/\r?\n/u).flatMap(line => {
        const row = /^\s*([A-Za-z0-9][A-Za-z0-9._:-]*)\s+-\s+\S/u.exec(line);
        return row ? [row[1]] : [];
    });
    if (!ids.length) return 'provider-catalog-unavailable';
    return ids.includes(model) ? undefined : 'provider-model-unavailable';
}
