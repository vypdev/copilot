import { expect, it } from 'vitest';
import { copySessionPreferences, currentSessionProfile, EMPTY_SESSION_PREFERENCES, loadSessionPreferences, planSessionPreferences,
    sameSessionPreferenceScope, sessionPreferenceRestriction, validSessionPreferenceIntent, validSessionPreferenceScope } from '../../src/domain/session_preferences.ts';
import { resolveProfile } from '../../src/domain/profile_resolution.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { sessionPreferenceDocument as document, SESSION_PREFERENCE_SCOPE as scope, SESSION_PREFERENCE_CONTEXT as context } from '../fixtures/session_preferences.ts';

it.each([null, [], {}, { ...scope, host: 'other' }, { ...scope, entryId: 'previous-session' }, { ...scope, entryId: 'x'.repeat(49) },
    { ...scope, entryId: '../native' }, { ...scope, selectionRevision: -1 }, { ...scope, selectionRevision: 0.5 }, { ...scope, selectionRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...scope, accountId: '0' }, { ...scope, repositoryId: '7x' }, { ...scope, token: 'private' }].map(value => ({ value })))('invalid native selection binding $value cannot claim a scope', ({ value }) => {
    expect(validSessionPreferenceScope(value)).toBe(false); expect(sameSessionPreferenceScope(scope, value)).toBe(false); expect(sameSessionPreferenceScope(value, scope)).toBe(false);
});
it('a complete native binding accepts bounded identifiers and safe natural selection counters without converting numeric identities', () => {
    expect(validSessionPreferenceScope(scope)).toBe(true); expect(sameSessionPreferenceScope(scope, { ...scope })).toBe(true);
    expect(validSessionPreferenceScope({ ...scope, entryId: 'x'.repeat(48), selectionRevision: Number.MAX_SAFE_INTEGER, accountId: '1'.repeat(20) })).toBe(true);
});
it.each(['entryId', 'selectionRevision', 'accountId', 'repositoryId'] as const)('a changed native %s selection field makes the earlier scope different', key => {
    const changed = { ...scope, [key]: key === 'selectionRevision' ? 4 : key === 'entryId' ? 's-other' : '99' }; expect(sameSessionPreferenceScope(scope, changed)).toBe(false);
});
it('absence is canonical empty only when observed as undefined, while future data is preserved as unavailable to this version', () => {
    expect(loadSessionPreferences(undefined)).toEqual({ state: 'ready', value: EMPTY_SESSION_PREFERENCES }); expect(loadSessionPreferences({ schemaVersion: 2, private: 'preserved' })).toEqual({ state: 'future' });
    expect(loadSessionPreferences(null)).toEqual({ state: 'corrupt' }); expect(loadSessionPreferences({})).toEqual({ state: 'corrupt' });
});
it.each([{ schemaVersion: 0 }, { revision: -1 }, { revision: 0.5 }, { preferences: null }, { scope: null }, { scope: { ...scope, accountId: '0' } },
    { preferences: {} }, { preferences: { connected: true } }, { preferences: { features: { unknown: true } } }, { preferences: { density: 'tiny' } },
    { preferences: { paused: 'true' } }, { extra: 'private' }])('a malformed document patch %j cannot become a canonical session preference', patch => {
    const value = { ...document(), ...patch }; expect(copySessionPreferences(value)).toBeNull(); expect(loadSessionPreferences(value)).toEqual({ state: 'corrupt' });
});
it('copying a canonical document freezes detached values without freezing the native caller or sharing its feature map', () => {
    const value = document(); const copy = copySessionPreferences(value)!; expect(copy).toEqual(value); expect(Object.isFrozen(copy.preferences.features)).toBe(true);
    expect(Object.isFrozen(value.scope)).toBe(false); expect(Object.isFrozen(value.preferences.features)).toBe(false); expect(copy.preferences.features).not.toBe(value.preferences.features);
    expect(copySessionPreferences({ ...EMPTY_SESSION_PREFERENCES, preferences: { features: {} } })).toEqual(EMPTY_SESSION_PREFERENCES);
});
it('accessor failure and mutable serialization cannot validate one native document and return a different document', () => {
    const value = document(); let calls = 0; Object.defineProperty(value, 'toJSON', { value: () => ++calls === 1 ? document() : { schemaVersion: 2 } });
    expect(copySessionPreferences(value)).toBeNull(); const broken = Object.defineProperty({}, 'schemaVersion', { get() { throw new Error('private'); } });
    expect(loadSessionPreferences(broken)).toEqual({ state: 'corrupt' }); expect(copySessionPreferences(broken)).toBeNull();
});
it.each([null, [], {}, { type: 'grant' }, { type: 'clear', scope }, { type: 'replace' }, { type: 'replace', preferences: { permission: true } },
    { type: 'replace', preferences: {}, scope }].map(value => ({ value })))('a malformed authoring intent $value cannot supply its own native target or authority', ({ value }) => {
    expect(validSessionPreferenceIntent(value)).toBe(false); expect(planSessionPreferences(document(), scope, value, 2)).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('a reviewed replacement snapshots the inferred native selection and retains no mutable caller reference', () => {
    const selected = { ...scope }; const input = { type: 'replace', preferences: { shortcuts: false, features: { 'BEX-NAV-01': false } } } as const;
    const plan = planSessionPreferences(EMPTY_SESSION_PREFERENCES, selected, input, 0); expect(plan).toMatchObject({ state: 'ready', after: { revision: 1, scope, preferences: input.preferences } });
    expect(Object.isFrozen(input.preferences)).toBe(false); expect(Object.isFrozen(selected)).toBe(false); if (plan.state === 'ready') expect(plan.after.scope).not.toBe(selected);
});
it('clear and an all-inherit replacement remove authored scope/values while retaining the CAS control revision', () => {
    for (const input of [{ type: 'clear' }, { type: 'replace', preferences: { features: {} } }] as const) expect(planSessionPreferences(document(), scope, input, 2)).toMatchObject({ state: 'ready', after: { revision: 3, scope: null, preferences: {} } });
    expect(planSessionPreferences(document(), null, { type: 'clear' }, 2)).toMatchObject({ state: 'ready' });
    expect(planSessionPreferences(document(), null, { type: 'replace', preferences: {} }, 2)).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('a different binding needs a new explicit publication even when desired values are identical', () => {
    const value = document(); expect(planSessionPreferences(value, scope, { type: 'replace', preferences: value.preferences }, 2)).toEqual({ state: 'unchanged' });
    expect(planSessionPreferences(value, { ...scope, selectionRevision: 4 }, { type: 'replace', preferences: value.preferences }, 2)).toMatchObject({ state: 'ready', after: { revision: 3, scope: { selectionRevision: 4 } } });
});
it('feature insertion order is canonical and an equivalent review does not manufacture a new publication', () => {
    const value = { ...document(), preferences: { features: { 'BEX-NAV-01': false, 'BEX-CENTER-01': true } } };
    expect(Object.keys(copySessionPreferences(value)!.preferences.features!)).toEqual(['BEX-CENTER-01', 'BEX-NAV-01']);
    expect(planSessionPreferences(value, scope, { type: 'replace', preferences: { features: { 'BEX-CENTER-01': true, 'BEX-NAV-01': false } } }, 2)).toEqual({ state: 'unchanged' });
});
it('invalid native source, revision conflict and overflow cannot publish or wrap a new revision', () => {
    expect(planSessionPreferences(null, scope, { type: 'clear' }, 0)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    expect(planSessionPreferences(document(), scope, { type: 'clear' }, -1)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    expect(planSessionPreferences(document(), scope, { type: 'clear' }, 1)).toEqual({ state: 'invalid', reason: 'conflict' });
    const full = { ...document(), revision: Number.MAX_SAFE_INTEGER };
    expect(planSessionPreferences(full, scope, { type: 'clear' }, full.revision)).toEqual({ state: 'invalid', reason: 'overflow' });
    expect(planSessionPreferences({ ...EMPTY_SESSION_PREFERENCES, revision: full.revision }, null, { type: 'clear' }, full.revision)).toEqual({ state: 'unchanged' });
});
it('current verified projection uses the fresh worker epoch only after the stable native selection matches', () => {
    const value = document(); expect(currentSessionProfile(value, context)).toMatchObject({ accountId: '1', repositoryId: '7', epoch: 9 });
    expect(currentSessionProfile(value, { ...context, credentialEpoch: 0 })?.epoch).toBe(0);
    for (const source of [null, { ...context, verified: false }, { ...context, credentialEpoch: -1 }, { ...context, scope: { ...scope, selectionRevision: 4 } }]) expect(currentSessionProfile(value, source)).toBeNull();
    expect(currentSessionProfile(EMPTY_SESSION_PREFERENCES, context)).toBeNull(); expect(Object.isFrozen(value.preferences)).toBe(false);
});
it('temporary enabling and a false pause retain inherited monotonic pause while disclosing the session source for actual overrides', () => {
    const value = { ...document(), preferences: { paused: false, density: 'compact' as const, features: { 'BEX-NAV-01': true } } };
    const session = currentSessionProfile(value, context)!; const resolved = resolveProfile({ ...DEFAULT_SETTINGS, paused: true }, undefined, DEFAULT_SETTINGS.center,
        { host: 'github.com', accountId: '1', repositoryId: '7', organizationId: null, sessionEpoch: 9 }, session);
    expect(resolved.paused).toBe(true); expect(resolved.pauseSources).toEqual(['global']); expect(resolved.sources.density).toBe('session'); expect(resolved.sources.features['BEX-NAV-01']).toBe('session');
});
it('a retained matching temporary pause may veto restoration but cannot enable a session profile', () => {
    const value = document(); const retained = { ...context, verified: false };
    expect(sessionPreferenceRestriction({ state: 'ready', value }, retained)).toEqual({ paused: true, reason: 'session' }); expect(currentSessionProfile(value, retained)).toBeNull();
});
it('empty canonical data needs no identity; unknown/inactive bindings remain explicitly different from a user pause', () => {
    expect(sessionPreferenceRestriction({ state: 'ready', value: EMPTY_SESSION_PREFERENCES }, null)).toEqual({ paused: false, reason: 'none' });
    for (const state of ['future', 'corrupt', 'unavailable'] as const) expect(sessionPreferenceRestriction({ state }, context)).toEqual({ paused: true, reason: 'unknown' });
    for (const source of [null, { ...context, credentialEpoch: -1 }, { ...context, scope: { ...scope, entryId: 'previous-session' } }]) expect(sessionPreferenceRestriction({ state: 'ready', value: document() }, source)).toEqual({ paused: true, reason: 'unknown' });
    expect(sessionPreferenceRestriction({ state: 'ready', value: document() }, { ...context, scope: { ...scope, entryId: 's-other' } })).toEqual({ paused: false, reason: 'inactive' });
    expect(sessionPreferenceRestriction({ state: 'ready', value: { ...document(), preferences: { paused: false } } }, context)).toEqual({ paused: false, reason: 'none' });
});
it('a connection-list revision change cannot silently release an earlier positive pause for the same selected native identity', () => {
    const changed = { ...context, scope: { ...scope, selectionRevision: 4 } }; const value = document();
    expect(currentSessionProfile(value, changed)).toBeNull(); expect(sessionPreferenceRestriction({ state: 'ready', value }, changed)).toEqual({ paused: true, reason: 'retained' });
    expect(sessionPreferenceRestriction({ state: 'ready', value: { ...value, preferences: { density: 'compact' } } }, changed)).toEqual({ paused: false, reason: 'inactive' });
});
