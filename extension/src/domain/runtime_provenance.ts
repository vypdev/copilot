import { nativePauseProvenance, type NativePauseProvenance } from './temporary_pause_observation.ts';
import type { RuntimePreferenceProvenance } from './runtime_preference_provenance.ts';
import { deepFreeze } from './value.ts';

export interface RuntimeRestriction {
    readonly native: NativePauseProvenance;
    readonly claimedRepository: boolean;
    readonly retainedScope: boolean;
}
export interface RuntimeProvenance {
    readonly preferences: RuntimePreferenceProvenance;
    readonly restriction: RuntimeRestriction;
    readonly connection: RuntimeConnectionFact;
}
export const RUNTIME_CONNECTION_STATES = ['disconnected', 'connected', 'unavailable', 'revalidating', 'limited', 'cooldown', 'budget'] as const;
export interface RuntimeConnectionFact { readonly state: typeof RUNTIME_CONNECTION_STATES[number]; readonly retryAt: number | null }
/** Missing native infrastructure is unavailable, never an implicit unpaused default. */
export const UNAVAILABLE_RUNTIME_RESTRICTION: RuntimeRestriction = deepFreeze({
    native: nativePauseProvenance({ condition: 'unavailable', loaded: { state: 'unavailable' } }, undefined), claimedRepository: false, retainedScope: false,
});
export function runtimeIsPaused(value: RuntimeProvenance): boolean {
    return value.preferences.pauses.length > 0 || value.restriction.native.restricted || value.restriction.claimedRepository || value.restriction.retainedScope;
}
