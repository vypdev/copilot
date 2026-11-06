import type { RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import type { RuntimeExplanation, RuntimeExplanationRow } from '../domain/runtime_explanation.ts';
import { FEATURE_METADATA } from '../domain/feature_metadata.ts';
import { featureText } from '../domain/feature_text.ts';
import { deepFreeze } from '../domain/value.ts';
import { runtimeProvenanceCopy } from './runtime_provenance_copy.ts';
import { runtimeCopy, statusText } from './runtime_copy.ts';
import { sessionPreferenceProvenanceCopy } from './session_preference_provenance_copy.ts';

/** Renderable generic labels only; no private source identities survive the closed configuration. */
export function runtimeProvenanceView(configuration: RuntimeConfiguration | null, locale: string, online: boolean | null = null): RuntimeExplanation {
    const copy = runtimeProvenanceCopy(locale);
    const common = { title: copy.title, scopeTitle: copy.scopeTitle, pausesTitle: copy.pausesTitle, featuresTitle: copy.featuresTitle, featuresHint: copy.featuresHint };
    if (!configuration) return deepFreeze({ ...common, summary: copy.unavailable, rows: [], scopes: [], pauses: [], features: [] });
    const p = configuration.provenance.preferences; const r = configuration.provenance.restriction; const native = r.native;
    const connection = configuration.provenance.connection; const stateCopy = runtimeCopy(locale);
    const boolean = (value: boolean | null) => value === null ? copy.unknown : value ? copy.yes : copy.no;
    const rows: RuntimeExplanationRow[] = [{ label: copy.density, value: copy[configuration.settings.density], source: copy.sources[p.density] },
        { label: copy.shortcuts, value: boolean(configuration.settings.shortcuts), source: copy.sources[p.shortcuts] },
        { label: copy.workerLabel, value: copy.workers[native.worker] }, { label: copy.nativeLabel, value: copy.natives[native.native] },
        { label: copy.emergency, value: boolean(native.emergency) }, { label: copy.tab, value: boolean(native.tab) },
        { label: copy.network, value: online === null ? copy.unknown : online ? copy.online : copy.offline },
        { label: copy.connection, value: connection.state === 'connected' ? stateCopy.connected : connection.state === 'disconnected' ? stateCopy.standalone : statusText(connection.state, stateCopy, connection.retryAt, undefined, locale) }];
    if (r.claimedRepository) rows.push({ label: copy.claimed, value: copy.yes });
    if (r.retainedScope) rows.push({ label: copy.retained, value: copy.yes });
    const temporary = sessionPreferenceProvenanceCopy(locale); const session = r.session;
    rows.push({ label: temporary.worker, value: copy.workers[session.worker] },
        { label: temporary.document, value: session.native === 'ready' ? temporary.documentRead : copy.natives[session.native] },
        { label: temporary.scope, value: session.scope === null ? copy.unknown : temporary.scopes[session.scope] });
    return deepFreeze({ ...common, summary: configuration.settings.paused ? copy.restricted : copy.available, rows,
        scopes: (['account', 'organization', 'repository', 'session'] as const).map(key => ({ label: copy[key], value: p.scope[key] ? copy.scopeKnown : copy.scopeUnknown })),
        pauses: p.pauses.length ? p.pauses.map(source => copy.sources[source]) : [copy.noSaved],
        features: FEATURE_METADATA.map(feature => ({ id: feature.id, label: featureText(feature, copy.locale)[0], value: boolean(configuration.settings.features[feature.id]), source: copy.sources[p.features[feature.id]] })) });
}
