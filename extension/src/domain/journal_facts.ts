import { CENTER_ROUTES, type CenterRoute } from './center_routes.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { RUNTIME_FAULT_CODES, type RuntimeFaultCode } from './runtime_health.ts';
import type { SettingsAction } from './settings_change.ts';
import { keys, record } from './value.ts';

const SETTINGS_ACTIONS: Readonly<Record<SettingsAction, true>> = Object.freeze({
    'profile-create': true, 'profile-edit': true, 'profile-select': true, 'profile-deselect': true, 'profile-remove': true,
    preferences: true, appearance: true, shortcuts: true, 'center-preferences': true, 'repository-preferences': true,
    import: true, rollback: true, 'reset-global': true, 'reset-profiles': true, 'reset-appearance': true,
    'reset-repository': true, 'reset-all': true,
});
export type JournalAction = SettingsAction | 'connect-read' | 'disconnect-read' | 'rename-session';
export const settingsJournalAction = (value: unknown): value is SettingsAction => typeof value === 'string' && Object.hasOwn(SETTINGS_ACTIONS, value);
export interface OperationFact {
    readonly kind: 'operation'; readonly action: JournalAction;
    readonly phase: 'reviewed' | 'cancelled' | 'blocked' | 'submitted' | 'settled';
    readonly acknowledgement: 'not-submitted' | 'accepted' | 'unknown';
    readonly observation: 'not-observed' | 'committed' | 'unchanged' | 'changed' | 'unavailable';
}
export interface HelperFact {
    readonly kind: 'helper'; readonly helper: 'runtime-health' | 'center-shortcuts'; readonly code: RuntimeFaultCode;
    readonly scope: 'active-at-observation' | 'retired-at-observation';
}
export interface DestinationFact { readonly kind: 'destination'; readonly route: CenterRoute; readonly featureId?: string }
export type DiagnosticFact = OperationFact | HelperFact;
export type JournalFact = DiagnosticFact | DestinationFact;
export type JournalKind = 'diagnostics' | 'recents';
export const journalKind = (value: unknown): value is JournalKind => value === 'diagnostics' || value === 'recents';

/** A deliberately closed projection: never accept a raw intent, target, error or provider object. */
export function journalFact(kind: JournalKind, value: unknown): value is JournalFact {
    if (!record(value)) return false;
    if (kind === 'recents') return value.kind === 'destination' && keys(value, ['kind', 'route', 'featureId'])
        && typeof value.route === 'string' && CENTER_ROUTES.includes(value.route as CenterRoute)
        && (Object.hasOwn(value, 'featureId') ? value.route === 'features' && typeof value.featureId === 'string'
            && Object.hasOwn(FEATURE_DEFAULTS, value.featureId) : Object.keys(value).length === 2);
    if (value.kind === 'helper') return keys(value, ['kind', 'helper', 'code', 'scope']) && Object.keys(value).length === 4
        && ['runtime-health', 'center-shortcuts'].includes(value.helper as string)
        && RUNTIME_FAULT_CODES.includes(value.code as RuntimeFaultCode)
        && ['active-at-observation', 'retired-at-observation'].includes(value.scope as string);
    if (value.kind !== 'operation' || !keys(value, ['kind', 'action', 'phase', 'acknowledgement', 'observation'])
        || Object.keys(value).length !== 5 || typeof value.action !== 'string'
        || !(Object.hasOwn(SETTINGS_ACTIONS, value.action) || ['connect-read', 'disconnect-read', 'rename-session'].includes(value.action))) return false;
    if (['reviewed', 'cancelled', 'blocked'].includes(value.phase as string)) {
        return value.acknowledgement === 'not-submitted' && value.observation === 'not-observed';
    }
    if (value.phase === 'submitted') return value.acknowledgement === 'unknown' && value.observation === 'not-observed';
    return value.phase === 'settled' && ['accepted', 'unknown'].includes(value.acknowledgement as string)
        && ['committed', 'unchanged', 'changed', 'unavailable'].includes(value.observation as string);
}

/** Later availability cannot erase completed facts or turn an old review into a different operation. */
export function operationTransition(before: OperationFact, after: OperationFact): boolean {
    if (before.action !== after.action) return false;
    if (before.phase === 'reviewed') return ['submitted', 'cancelled', 'blocked'].includes(after.phase);
    if (before.phase === 'submitted') return after.phase === 'settled';
    if (before.phase !== 'settled' || after.phase !== 'settled' || before.observation === 'committed') return false;
    return before.acknowledgement !== 'accepted' || after.acknowledgement === 'accepted';
}
