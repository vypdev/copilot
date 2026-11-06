import { exactHistoryFields as fields } from './history_decode.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { RUNTIME_PREFERENCE_SOURCES, runtimePausesOrdered, runtimeSourceApplies, type RuntimePreferenceSource, type RuntimePreferenceApplicability } from './runtime_preference_provenance.ts';
import { RUNTIME_CONNECTION_STATES, runtimeIsPaused, type RuntimeProvenance, type RuntimeConnectionFact } from './runtime_provenance.ts';
import type { NativePauseProvenance } from './temporary_pause_observation.ts';
import { record, natural } from './value.ts';
import { validSessionPreferenceProvenance } from './session_preference_provenance.ts';

const source = (value: unknown): value is RuntimePreferenceSource => RUNTIME_PREFERENCE_SOURCES.includes(value as RuntimePreferenceSource);
export function validRuntimeConnection(value: unknown): value is RuntimeConnectionFact {
    return fields(value, ['state', 'retryAt']) && RUNTIME_CONNECTION_STATES.includes(value.state as RuntimeConnectionFact['state'])
        && (value.retryAt === null || natural(value.retryAt) && value.retryAt <= 8640000000000000 && ['limited', 'cooldown', 'budget'].includes(value.state as string));
}
function scope(value: unknown): value is RuntimePreferenceApplicability {
    return fields(value, ['account', 'organization', 'repository', 'session']) && Object.values(value).every(value => typeof value === 'boolean')
        && (!value.organization || value.repository === true) && (!value.repository || value.account === true) && (!value.session || value.repository === true);
}
export function validNativePauseProvenance(value: unknown): value is NativePauseProvenance {
    if (!fields(value, ['worker', 'native', 'emergency', 'tab', 'restricted']) || typeof value.restricted !== 'boolean'
        || ![null, false, true].includes(value.emergency as null) || ![null, false, true].includes(value.tab as null)) return false;
    if (value.worker !== 'clear') return ['pending', 'precaution', 'pending-precaution', 'unavailable'].includes(value.worker as string)
        && value.native === 'not-checked' && value.emergency === null && value.tab === null && value.restricted;
    if (value.native === 'future' || value.native === 'corrupt') return value.emergency === null && value.tab === null && value.restricted;
    if (value.native === 'unavailable') return value.tab === null && value.restricted;
    return value.emergency !== null && value.tab !== null && value.native === (value.emergency ? 'emergency' : value.tab ? 'tab' : 'none')
        && value.restricted === (value.emergency || value.tab);
}
/** Exact scalar metadata and cross-field invariants; no source code or fact can grant a connection. */
export function validRuntimeProvenance(value: unknown, paused: boolean, connected: boolean): value is RuntimeProvenance {
    if (!fields(value, ['preferences', 'restriction', 'connection']) || !validRuntimeConnection(value.connection) || !fields(value.preferences, ['scope', 'density', 'shortcuts', 'features', 'pauses'])
        || !fields(value.restriction, ['native', 'claimedRepository', 'retainedScope', 'session']) || !validNativePauseProvenance(value.restriction.native)
        || !validSessionPreferenceProvenance(value.restriction.session)
        || typeof value.restriction.claimedRepository !== 'boolean' || typeof value.restriction.retainedScope !== 'boolean') return false;
    const p = value.preferences;
    if (!scope(p.scope) || !source(p.density) || !source(p.shortcuts) || !runtimeSourceApplies(p.density, p.scope) || !runtimeSourceApplies(p.shortcuts, p.scope)
        || !record(p.features) || Object.keys(p.features).length !== Object.keys(FEATURE_DEFAULTS).length
        || !Object.entries(p.features).every(([id, value]) => Object.hasOwn(FEATURE_DEFAULTS, id) && source(value) && runtimeSourceApplies(value, p.scope as RuntimePreferenceApplicability))
        || !Array.isArray(p.pauses) || p.pauses.length > 8 || !p.pauses.every(value => source(value) && value !== 'default' && runtimeSourceApplies(value, p.scope as RuntimePreferenceApplicability))
        || !runtimePausesOrdered(p.pauses)) return false;
    const session = value.restriction.session;
    if (p.scope.session !== (session.scope === 'active') || p.pauses.includes('session') !== (session.scope === 'active' && session.restricted)) return false;
    return paused === runtimeIsPaused(value as unknown as RuntimeProvenance) && (!connected || !paused && p.scope.repository && value.connection.state === 'connected');
}
