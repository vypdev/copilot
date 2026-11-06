import { RUNTIME_FAULT_CODES, type RuntimeFaultCode } from './runtime_health.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

export const HELPER_IDS = Object.freeze(['runtime-health', 'center-shortcuts'] as const);
export type HelperId = typeof HELPER_IDS[number];
export interface HelperReason { readonly featureId: HelperId; readonly code: RuntimeFaultCode; readonly scope: 'active-at-observation' | 'retired-at-observation' }
export interface HelperSnapshot { readonly blocked: readonly HelperId[]; readonly events: readonly HelperReason[] }
/** Native source receipts are for admission only; they never enter a retained helper reason. */
export type HelperSampleIntent = { readonly state: 'ready'; readonly sourceTree: string; readonly generation: number;
    readonly credentialEpoch: number; readonly settingsRevision: number; readonly health: HelperSnapshot }
    | { readonly state: 'unavailable'; readonly sourceTree: string };
export const helperId = (value: unknown): value is HelperId => typeof value === 'string' && HELPER_IDS.includes(value as HelperId);
export function helperReason(value: unknown): value is HelperReason {
    return record(value) && keys(value, ['featureId', 'code', 'scope']) && Object.keys(value).length === 3
        && helperId(value.featureId) && typeof value.code === 'string' && RUNTIME_FAULT_CODES.includes(value.code as RuntimeFaultCode)
        && (value.scope === 'active-at-observation' || value.scope === 'retired-at-observation');
}
export function helperSnapshot(value: unknown): value is HelperSnapshot {
    return record(value) && keys(value, ['blocked', 'events']) && Object.keys(value).length === 2
        && Array.isArray(value.blocked) && value.blocked.length <= 2 && new Set(value.blocked).size === value.blocked.length && value.blocked.every(helperId)
        && Array.isArray(value.events) && value.events.length <= 100 && value.events.every(helperReason);
}
export function helperSampleIntent(value: unknown): value is HelperSampleIntent {
    if (!record(value) || typeof value.sourceTree !== 'string' || !/^[a-f0-9]{64}$(?![\s\S])/u.test(value.sourceTree) || !jsonBytesWithin(value, 16384)) return false;
    if (value.state === 'unavailable') return keys(value, ['state', 'sourceTree']) && Object.keys(value).length === 2;
    return value.state === 'ready' && keys(value, ['state', 'sourceTree', 'generation', 'credentialEpoch', 'settingsRevision', 'health'])
        && Object.keys(value).length === 6 && natural(value.generation) && natural(value.credentialEpoch) && natural(value.settingsRevision) && helperSnapshot(value.health);
}
/** The native gateway must snapshot before its first async boundary and validate again after detachment. */
export function snapshotHelperIntent(value: unknown): HelperSampleIntent | null {
    try {
        if (!helperSampleIntent(value)) return null;
        const copy: unknown = JSON.parse(JSON.stringify(value)); return helperSampleIntent(copy) ? deepFreeze(copy) : null;
    } catch { return null; }
}
/** One latest reason per fixed helper, not a replay of the100-event ring into persistent history. */
export function latestHelperReasons(value: HelperSnapshot): readonly HelperReason[] {
    return deepFreeze(HELPER_IDS.flatMap(id => {
        const reason = [...value.events].reverse().find(event => event.featureId === id);
        return reason ? [{ ...reason }] : [];
    }));
}
