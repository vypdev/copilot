import { EMPTY_SESSION_PREFERENCES, type SessionPreferenceScope, type SessionPreferences, type SessionPreferenceContext } from '../../src/domain/session_preferences.ts';

export const SESSION_PREFERENCE_SCOPE: SessionPreferenceScope = { host: 'github.com', entryId: 's-native-session', selectionRevision: 3, accountId: '1', repositoryId: '7' };
export const SESSION_PREFERENCE_CONTEXT: SessionPreferenceContext = { scope: SESSION_PREFERENCE_SCOPE, credentialEpoch: 9, verified: true };
export function sessionPreferenceDocument(): SessionPreferences {
    return { ...EMPTY_SESSION_PREFERENCES, revision: 2, scope: { ...SESSION_PREFERENCE_SCOPE }, preferences: { density: 'compact', paused: true, features: { 'BEX-NAV-01': false } } };
}
