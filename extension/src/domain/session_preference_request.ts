import type { SessionPreferenceMessage } from './session_preference_protocol.ts';

type Request<T> = T extends SessionPreferenceMessage ? Omit<T, 'version' | 'clientId' | 'controllerEpoch' | 'credentialEpoch'> : never;
/** Renderer use cases cannot contain reusable native identity or server-retained effects. */
export type SessionPreferenceRequest = Request<SessionPreferenceMessage>;
export const SESSION_PREFERENCE_EFFECTS = Object.freeze({ 'center.session-preferences.read': false, 'center.session-preferences.preview': true,
    'center.session-preferences.confirm': true, 'center.session-preferences.cancel': true, 'center.session-preferences.result': false } as const);
