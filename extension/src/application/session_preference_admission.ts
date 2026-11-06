import type { PageRequest } from '../domain/runtime_configuration.ts';
import { pageProfileContext } from '../domain/runtime_configuration.ts';
import type { SessionIdentity } from '../domain/session.ts';
import type { SessionProfile } from '../domain/profile_resolution.ts';
import { currentSessionProfile, sessionPreferenceRestriction } from '../domain/session_preferences.ts';
import type { SessionPreferenceProvenance } from '../domain/session_preference_provenance.ts';
import { deepFreeze } from '../domain/value.ts';
import type { NamedSessions } from './named_sessions.ts';
import type { SessionPreferencesReader, SessionPreferenceObservation } from './session_preferences_reader.ts';

export interface SessionPreferenceAdmissionView {
    readonly observed: SessionPreferenceObservation; readonly provenance: SessionPreferenceProvenance;
    readonly profile: SessionProfile | null; readonly current: () => boolean;
}
/** Observe protected metadata before restoration. Only an already verified native selection can enable an override. */
export class SessionPreferenceAdmission {
    constructor(private readonly reader: SessionPreferencesReader, private readonly connections: NamedSessions) {}
    get clear(): boolean { return this.reader.condition === 'clear'; }
    async inspect(message: PageRequest, identity: SessionIdentity | null, current: () => boolean): Promise<SessionPreferenceAdmissionView> {
        const observed = await this.reader.observe();
        const result = (provenance: SessionPreferenceProvenance, profile: SessionProfile | null = null, live = current): SessionPreferenceAdmissionView =>
            Object.freeze({ observed, provenance: deepFreeze(provenance), profile, current: live });
        if (observed.condition !== 'clear') return result({ worker: observed.condition, native: 'not-checked', scope: null, restricted: true });
        if (observed.loaded.state !== 'ready') return result({ worker: 'clear', native: observed.loaded.state, scope: null, restricted: true });
        const snapshot = observed.loaded.value;
        const fact = (scope: SessionPreferenceProvenance['scope'], restricted = false): SessionPreferenceProvenance => ({ worker: 'clear', native: 'ready', scope, restricted });
        if (snapshot.scope === null) return result(fact('empty'));
        // A numeric route claim can only veto. It cannot establish a native account or selection.
        if (message.repositoryId !== snapshot.scope.repositoryId) return result(fact('inactive'));
        if (!identity) return result(fact('unverified', snapshot.preferences.paused === true));
        if (pageProfileContext(message, identity).repositoryId === null) return result(fact('inactive'));
        const source = this.connections.capturePreferenceSource(); const live = () => current() && source() && this.clear;
        if (!live()) return result(fact('unknown', true), null, live);
        const binding = await this.connections.preferenceBinding(live);
        if (!live() || binding.state !== 'ready' || !binding.context.verified) return result(fact('unknown', true), null, live);
        const decision = sessionPreferenceRestriction(observed.loaded, binding.context);
        const profile = currentSessionProfile(snapshot, binding.context);
        return result(fact(decision.reason === 'retained' ? 'retained' : decision.reason === 'inactive' ? 'inactive' : 'active', decision.paused), profile, live);
    }
    async unchanged(value: SessionPreferenceAdmissionView): Promise<boolean> {
        if (!value.current()) return false; const next = await this.reader.observe();
        return value.current() && JSON.stringify(next) === JSON.stringify(value.observed);
    }
}
