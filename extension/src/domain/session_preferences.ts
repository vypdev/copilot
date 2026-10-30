import { localIdentifier } from './center_routes.ts';
import { numericIdentity, validProfilePreferences } from './center_profiles.ts';
import type { Preferences } from './preferences.ts';
import type { SessionProfile } from './profile_resolution.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

/** Stable native selection ownership; never an operand supplied by a page or an authoring client. */
export interface SessionPreferenceScope {
    readonly host: 'github.com'; readonly entryId: string; readonly selectionRevision: number;
    readonly accountId: string; readonly repositoryId: string;
}
export interface SessionPreferences {
    readonly schemaVersion: 1; readonly revision: number; readonly scope: SessionPreferenceScope | null;
    readonly preferences: Partial<Preferences>;
}
export type SessionPreferencesLoad = { readonly state: 'ready'; readonly value: SessionPreferences }
    | { readonly state: 'future' | 'corrupt' | 'unavailable' };
export interface SessionPreferenceContext { readonly scope: SessionPreferenceScope; readonly credentialEpoch: number; readonly verified: boolean }
export const EMPTY_SESSION_PREFERENCES: SessionPreferences = deepFreeze({ schemaVersion: 1, revision: 0, scope: null, preferences: {} });
export type SessionPreferenceIntent = { readonly type: 'replace'; readonly preferences: Partial<Preferences> } | { readonly type: 'clear' };
export type SessionPreferencePlan = { readonly state: 'ready'; readonly before: SessionPreferences; readonly after: SessionPreferences }
    | { readonly state: 'unchanged' } | { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'conflict' | 'overflow' };

export function validSessionPreferenceScope(value: unknown): value is SessionPreferenceScope {
    return record(value) && keys(value, ['host', 'entryId', 'selectionRevision', 'accountId', 'repositoryId']) && Object.keys(value).length === 5
        && value.host === 'github.com' && localIdentifier(value.entryId) && value.entryId !== 'previous-session'
        && natural(value.selectionRevision) && numericIdentity(value.accountId) && numericIdentity(value.repositoryId);
}
export function sameSessionPreferenceScope(left: unknown, right: unknown): boolean {
    return validSessionPreferenceScope(left) && validSessionPreferenceScope(right)
        && (['host', 'entryId', 'selectionRevision', 'accountId', 'repositoryId'] as const).every(key => left[key] === right[key]);
}
function sameSelectionIdentity(left: SessionPreferenceScope, right: SessionPreferenceScope): boolean {
    return (['host', 'entryId', 'accountId', 'repositoryId'] as const).every(key => left[key] === right[key]);
}
function populated(value: Partial<Preferences>): boolean {
    return value.density !== undefined || value.shortcuts !== undefined || value.paused !== undefined || Object.keys(value.features ?? {}).length > 0;
}
function copyPreferences(value: Partial<Preferences>): Partial<Preferences> {
    return { ...(value.density === undefined ? {} : { density: value.density }), ...(value.shortcuts === undefined ? {} : { shortcuts: value.shortcuts }),
        ...(value.paused === undefined ? {} : { paused: value.paused }), ...(value.features && Object.keys(value.features).length
            ? { features: Object.fromEntries(Object.entries(value.features).sort(([a], [b]) => a.localeCompare(b))) } : {}) };
}
function copyScope(value: SessionPreferenceScope): SessionPreferenceScope {
    return { host: value.host, entryId: value.entryId, selectionRevision: value.selectionRevision, accountId: value.accountId, repositoryId: value.repositoryId };
}
function validDocument(value: unknown): value is SessionPreferences {
    return record(value) && keys(value, ['schemaVersion', 'revision', 'scope', 'preferences']) && Object.keys(value).length === 4
        && value.schemaVersion === 1 && natural(value.revision) && validProfilePreferences(value.preferences)
        && (value.scope === null ? !populated(value.preferences) : validSessionPreferenceScope(value.scope) && populated(value.preferences))
        && jsonBytesWithin(value, 16384);
}
/** A detached canonical snapshot; caller-owned records are never frozen or repaired in storage. */
export function copySessionPreferences(value: unknown): SessionPreferences | null {
    try {
        if (!validDocument(value)) return null;
        const detached: unknown = JSON.parse(JSON.stringify(value)); if (!validDocument(detached)) return null;
        return deepFreeze({ schemaVersion: 1, revision: detached.revision, scope: detached.scope ? copyScope(detached.scope) : null,
            preferences: copyPreferences(detached.preferences) });
    } catch { return null; }
}
export function loadSessionPreferences(value: unknown): SessionPreferencesLoad {
    if (value === undefined) return { state: 'ready', value: EMPTY_SESSION_PREFERENCES };
    try { if (record(value) && natural(value.schemaVersion) && value.schemaVersion > 1) return { state: 'future' }; }
    catch { return { state: 'corrupt' }; }
    const snapshot = copySessionPreferences(value); return snapshot ? { state: 'ready', value: snapshot } : { state: 'corrupt' };
}
export function validSessionPreferenceIntent(value: unknown): value is SessionPreferenceIntent {
    return record(value) && (value.type === 'clear' ? keys(value, ['type']) && Object.keys(value).length === 1
        : value.type === 'replace' && keys(value, ['type', 'preferences']) && Object.keys(value).length === 2
            && validProfilePreferences(value.preferences) && jsonBytesWithin(value.preferences, 16384));
}
/** Planning conveys no binding, native permission or mutation authority. */
export function planSessionPreferences(value: unknown, binding: SessionPreferenceScope | null, input: unknown, revision: number): SessionPreferencePlan {
    const before = copySessionPreferences(value);
    if (!before || !validSessionPreferenceIntent(input) || !natural(revision)
        || input.type === 'replace' && !validSessionPreferenceScope(binding)) return { state: 'invalid', reason: 'invalid-input' };
    if (before.revision !== revision) return { state: 'invalid', reason: 'conflict' };
    const preferences = input.type === 'clear' ? {} : copyPreferences(input.preferences);
    const scope = populated(preferences) ? binding : null;
    if ((scope === null && before.scope === null || sameSessionPreferenceScope(scope, before.scope))
        && JSON.stringify(copyPreferences(before.preferences)) === JSON.stringify(preferences)) return { state: 'unchanged' };
    if (revision === Number.MAX_SAFE_INTEGER) return { state: 'invalid', reason: 'overflow' };
    return deepFreeze({ state: 'ready', before, after: { schemaVersion: 1, revision: revision + 1, scope: scope ? copyScope(scope) : null, preferences } });
}
/** Only current verified native ownership may enable preferences; a retained match is never promoted. */
export function currentSessionProfile(snapshot: SessionPreferences, context: SessionPreferenceContext | null): SessionProfile | null {
    if (context?.verified !== true || !natural(context.credentialEpoch) || !sameSessionPreferenceScope(snapshot.scope, context.scope)) return null;
    return deepFreeze({ accountId: context.scope.accountId, repositoryId: context.scope.repositoryId, epoch: context.credentialEpoch,
        preferences: copyPreferences(snapshot.preferences) });
}
/** Unknown ownership is a veto, not an invented user pause. Empty canonical data requires no credential observation. */
export function sessionPreferenceRestriction(loaded: SessionPreferencesLoad, context: SessionPreferenceContext | null): { readonly paused: boolean; readonly reason: 'none' | 'session' | 'retained' | 'unknown' | 'inactive' } {
    if (loaded.state !== 'ready') return { paused: true, reason: 'unknown' };
    if (loaded.value.scope === null) return { paused: false, reason: 'none' };
    if (!context || !validSessionPreferenceScope(context.scope) || !natural(context.credentialEpoch)) return { paused: true, reason: 'unknown' };
    if (!sameSessionPreferenceScope(loaded.value.scope, context.scope)) return sameSelectionIdentity(loaded.value.scope, context.scope) && loaded.value.preferences.paused === true
        ? { paused: true, reason: 'retained' } : { paused: false, reason: 'inactive' };
    return { paused: loaded.value.preferences.paused === true, reason: loaded.value.preferences.paused === true ? 'session' : 'none' };
}
