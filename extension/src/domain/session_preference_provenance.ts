import type { TemporaryPauseCondition } from './temporary_pause_observation.ts';
import { exactHistoryFields as fields } from './history_decode.ts';

/** Closed redacted causes; no native selection ID, revision, account, credential or operation selector. */
export interface SessionPreferenceProvenance {
    readonly worker: TemporaryPauseCondition;
    readonly native: 'not-checked' | 'ready' | 'future' | 'corrupt' | 'unavailable';
    readonly scope: 'empty' | 'active' | 'retained' | 'inactive' | 'unverified' | 'unknown' | null;
    readonly restricted: boolean;
}
export const UNAVAILABLE_SESSION_PREFERENCE_PROVENANCE: SessionPreferenceProvenance = Object.freeze({ worker: 'unavailable', native: 'not-checked', scope: null, restricted: true });
export function validSessionPreferenceProvenance(value: unknown): value is SessionPreferenceProvenance {
    if (!fields(value, ['worker', 'native', 'scope', 'restricted']) || typeof value.restricted !== 'boolean') return false;
    if (value.worker !== 'clear') return ['pending', 'precaution', 'pending-precaution', 'unavailable'].includes(value.worker as string)
        && value.native === 'not-checked' && value.scope === null && value.restricted;
    if (value.native !== 'ready') return ['future', 'corrupt', 'unavailable'].includes(value.native as string) && value.scope === null && value.restricted;
    if (value.scope === 'empty' || value.scope === 'inactive') return !value.restricted;
    if (value.scope === 'unknown' || value.scope === 'retained') return value.restricted;
    return ['active', 'unverified'].includes(value.scope as string);
}
