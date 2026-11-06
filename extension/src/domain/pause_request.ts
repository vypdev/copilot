import type { PauseMessage } from './temporary_pause_protocol.ts';

type Intent<T> = T extends PauseMessage ? Omit<T, 'version' | 'clientId' | 'controllerEpoch' | 'credentialEpoch'> : never;
/** Logical use cases only. Native client/controller authority stays private in the mounted transport owner. */
export type PauseRequest = Intent<PauseMessage>;
export const PAUSE_EFFECTS = Object.freeze({ 'center.pauses.read': false, 'center.pauses.preview': true,
    'center.pauses.confirm': true, 'center.pauses.cancel': true, 'center.pauses.result': false } as const);
