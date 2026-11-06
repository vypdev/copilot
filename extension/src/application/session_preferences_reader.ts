import { loadSessionPreferences, type SessionPreferencesLoad } from '../domain/session_preferences.ts';
import type { TemporaryPauseCondition as NativeMutationCondition } from '../domain/temporary_pause_observation.ts';
import { deepFreeze } from '../domain/value.ts';
import type { StoragePort } from './runtime_ports.ts';

export const SESSION_PREFERENCES_KEY = 'copilot.session-preferences.v1';
export interface SessionPreferenceObservation { readonly condition: NativeMutationCondition; readonly loaded: SessionPreferencesLoad }
/** Protected session-only observation. Missing or uncertain admission never means an empty override. */
export class SessionPreferencesReader {
    constructor(private readonly storage: StoragePort, private readonly protectedArea: () => Promise<boolean>,
        private readonly restricted: () => NativeMutationCondition = () => 'clear') {}
    get condition(): NativeMutationCondition {
        try {
            const value = this.restricted(); return ['clear', 'pending', 'precaution', 'pending-precaution'].includes(value) ? value : 'unavailable';
        } catch { return 'unavailable'; }
    }
    private unavailable(condition: NativeMutationCondition): SessionPreferenceObservation { return deepFreeze({ condition, loaded: { state: 'unavailable' } }); }
    async observe(): Promise<SessionPreferenceObservation> {
        const initial = this.condition; if (initial !== 'clear') return this.unavailable(initial);
        try {
            if (!await this.protectedArea()) return this.unavailable(this.condition);
            const authorized = this.condition; if (authorized !== 'clear') return this.unavailable(authorized);
            const loaded = loadSessionPreferences(await this.storage.get(SESSION_PREFERENCES_KEY)); const after = this.condition;
            return after === 'clear' ? deepFreeze({ condition: after, loaded }) : this.unavailable(after);
        } catch { return this.unavailable(this.condition); }
    }
    async read(): Promise<SessionPreferencesLoad> { return (await this.observe()).loaded; }
}
