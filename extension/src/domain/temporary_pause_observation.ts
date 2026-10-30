import { deepFreeze, natural } from './value.ts';
import { temporaryPauseRestriction, type TemporaryPauseLoad } from './temporary_pauses.ts';

/** Closed worker facts only: no hold counts, tokens, witness or durable-pause attribution. */
export type TemporaryPauseCondition = 'clear' | 'pending' | 'precaution' | 'pending-precaution' | 'unavailable';
export interface TemporaryPauseObservation {
    readonly condition: TemporaryPauseCondition;
    readonly loaded: TemporaryPauseLoad;
}
export interface NativePauseProvenance {
    readonly worker: TemporaryPauseCondition;
    readonly native: 'not-checked' | 'none' | 'tab' | 'emergency' | 'future' | 'corrupt' | 'unavailable';
    readonly emergency: boolean | null;
    readonly tab: boolean | null;
    readonly restricted: boolean;
}
/** A restriction explanation, never a grant or proof that an unavailable record is empty. */
export function nativePauseProvenance(value: TemporaryPauseObservation, nativeTabId: unknown): NativePauseProvenance {
    if (value.condition !== 'clear') return deepFreeze({ worker: value.condition, native: 'not-checked', emergency: null, tab: null, restricted: true });
    if (value.loaded.state !== 'ready') return deepFreeze({ worker: 'clear', native: value.loaded.state, emergency: null, tab: null, restricted: true });
    const decision = temporaryPauseRestriction(value.loaded, nativeTabId);
    return deepFreeze({ worker: 'clear', native: decision.source, emergency: value.loaded.value.emergency,
        tab: natural(nativeTabId) ? value.loaded.value.tabs.includes(nativeTabId) : null, restricted: decision.paused });
}
