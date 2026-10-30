import type { SessionPreferencesLoad, sessionPreferenceRestriction } from './session_preferences.ts';
import type { SessionPreferenceBinding } from './session_preference_binding.ts';
import type { ResolvedProfile } from './profile_resolution.ts';

/** Native options only. Content receives a separate redacted configuration projection. */
export interface SessionPreferenceRead {
    readonly state: 'ready'; readonly loaded: SessionPreferencesLoad; readonly pending: boolean; readonly precaution: boolean;
    readonly source: SessionPreferenceBinding | null; readonly settingsState: 'ready' | 'future' | 'invalid' | 'unavailable'; readonly settingsRevision: number | null;
    readonly effective: ResolvedProfile | null; readonly restriction: ReturnType<typeof sessionPreferenceRestriction>;
}
