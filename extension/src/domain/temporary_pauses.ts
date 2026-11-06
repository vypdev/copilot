import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

/** Browser-session restrictions contain native tab IDs only, never URLs, credentials or saved preferences. */
export interface TemporaryPauses {
    readonly schemaVersion: 1; readonly revision: number; readonly emergency: boolean; readonly tabs: readonly number[];
}
export const DEFAULT_TEMPORARY_PAUSES: TemporaryPauses = deepFreeze({ schemaVersion: 1, revision: 0, emergency: false, tabs: [] });
export type TemporaryPauseLoad = { readonly state: 'ready'; readonly value: TemporaryPauses }
    | { readonly state: 'future' | 'corrupt' | 'unavailable' };
export type TemporaryPauseIntent = { readonly type: 'emergency'; readonly paused: boolean }
    | { readonly type: 'tab'; readonly tabId: number; readonly paused: boolean };
export type TemporaryPausePlan = { readonly state: 'ready'; readonly before: TemporaryPauses; readonly after: TemporaryPauses }
    | { readonly state: 'unchanged' } | { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'conflict' | 'capacity' | 'overflow' };

function validTemporaryPauses(value: unknown): value is TemporaryPauses {
    return record(value) && keys(value, ['schemaVersion', 'revision', 'emergency', 'tabs']) && Object.keys(value).length === 4
        && value.schemaVersion === 1 && natural(value.revision) && typeof value.emergency === 'boolean'
        && Array.isArray(value.tabs) && value.tabs.length <= 128 && Object.keys(value.tabs).length === value.tabs.length
        && value.tabs.every(natural) && new Set(value.tabs).size === value.tabs.length && jsonBytesWithin(value, 16384);
}
/** Copy, revalidate and canonicalize without freezing the native caller's record. */
export function copyTemporaryPauses(value: unknown): TemporaryPauses | null {
    try {
        if (!validTemporaryPauses(value)) return null;
        const detached: unknown = JSON.parse(JSON.stringify(value));
        if (!validTemporaryPauses(detached)) return null;
        return deepFreeze({ schemaVersion: 1, revision: detached.revision, emergency: detached.emergency,
            tabs: [...detached.tabs].sort((left, right) => left - right) });
    } catch { return null; }
}
export function loadTemporaryPauses(value: unknown): TemporaryPauseLoad {
    if (value === undefined) return { state: 'ready', value: DEFAULT_TEMPORARY_PAUSES };
    try { if (record(value) && natural(value.schemaVersion) && value.schemaVersion > 1) return { state: 'future' }; }
    catch { return { state: 'corrupt' }; }
    const snapshot = copyTemporaryPauses(value);
    return snapshot ? { state: 'ready', value: snapshot } : { state: 'corrupt' };
}
export function validTemporaryPauseIntent(value: unknown): value is TemporaryPauseIntent {
    return record(value) && typeof value.paused === 'boolean'
        && (value.type === 'emergency' ? keys(value, ['type', 'paused']) && Object.keys(value).length === 2
            : value.type === 'tab' && keys(value, ['type', 'tabId', 'paused']) && Object.keys(value).length === 3 && natural(value.tabId));
}
/** A pure preview only. Native source, controller, persistence and acknowledgement remain application duties. */
export function planTemporaryPauseChange(value: unknown, intent: unknown, expectedRevision: number): TemporaryPausePlan {
    const before = copyTemporaryPauses(value);
    if (!before || !validTemporaryPauseIntent(intent) || !natural(expectedRevision)) return { state: 'invalid', reason: 'invalid-input' };
    if (before.revision !== expectedRevision) return { state: 'invalid', reason: 'conflict' };
    let emergency = before.emergency; let tabs = [...before.tabs];
    if (intent.type === 'emergency') emergency = intent.paused;
    else if (intent.paused && !tabs.includes(intent.tabId)) {
        if (tabs.length >= 128) return { state: 'invalid', reason: 'capacity' };
        tabs.push(intent.tabId); tabs.sort((left, right) => left - right);
    } else if (!intent.paused) tabs = tabs.filter(id => id !== intent.tabId);
    if (emergency === before.emergency && JSON.stringify(tabs) === JSON.stringify(before.tabs)) return { state: 'unchanged' };
    if (before.revision === Number.MAX_SAFE_INTEGER) return { state: 'invalid', reason: 'overflow' };
    return deepFreeze({ state: 'ready', before, after: { ...before, revision: before.revision + 1, emergency, tabs } });
}
/** Restriction-only: an unpaused answer grants neither a connection nor permission to read or write. */
export function temporaryPauseRestriction(loaded: TemporaryPauseLoad, nativeTabId: unknown): {
    readonly paused: boolean; readonly source: 'none' | 'tab' | 'emergency' | 'unavailable';
} {
    if (loaded.state !== 'ready' || !natural(nativeTabId)) return { paused: true, source: 'unavailable' };
    if (loaded.value.emergency) return { paused: true, source: 'emergency' };
    return loaded.value.tabs.includes(nativeTabId) ? { paused: true, source: 'tab' } : { paused: false, source: 'none' };
}
