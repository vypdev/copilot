import { expect, it } from 'vitest';
import { sessionPreferenceDraft as draft, draftSessionPreferences as compile, type SessionPreferenceDraft } from '../../src/domain/session_preference_draft.ts';
import { resolvedPreferenceSource, resolvedSessionMatches, validResolvedProfile } from '../../src/domain/resolved_profile_validation.ts';
import { resolveProfile } from '../../src/domain/profile_resolution.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

it('empty native preferences initialize all150 independent inherited feature choices and compile to canonical inheritance', () => {
    const value = draft({}); expect(Object.keys(value.features)).toHaveLength(150); expect(Object.values(value.features).every(choice => choice === 'inherit')).toBe(true); expect(compile(value)).toEqual({});
});
it('explicit true and false choices survive draft conversion while inherited removals are absent and features are ordered', () => {
    const source = { density: 'compact' as const, shortcuts: false, paused: true, features: { 'BEX-NAV-02': false, 'BEX-CODE-01': true } };
    const value = draft(source); expect(compile(value)).toEqual({ density: 'compact', shortcuts: false, paused: true, features: { 'BEX-CODE-01': true, 'BEX-NAV-02': false } });
    value.density = 'inherit'; value.shortcuts = 'inherit'; value.features['BEX-CODE-01'] = 'inherit'; expect(compile(value)).toEqual({ paused: true, features: { 'BEX-NAV-02': false } }); expect(source.features['BEX-CODE-01']).toBe(true);
});
it.each(['density', 'shortcuts', 'paused', 'feature-value', 'missing-feature', 'foreign-feature'] as const)('a malformed %s authoring choice cannot compile to a preference payload', kind => {
    const value: unknown = kind === 'feature-value' ? { ...draft({}), features: { ...draft({}).features, 'BEX-NAV-01': 'foreign' } }
        : kind === 'missing-feature' ? { ...draft({}), features: {} } : kind === 'foreign-feature' ? { ...draft({}), features: { ...draft({}).features, foreign: 'yes' } } : { ...draft({}), [kind]: 'foreign' };
    expect(compile(value as SessionPreferenceDraft)).toBeNull();
});
const context = { host: 'github.com', accountId: '1', repositoryId: '7', organizationId: null, sessionEpoch: 9 } as const;
it('resolved effective values require each explicitly supplied session feature and scalar source to match', () => {
    const preferences = { density: 'compact' as const, shortcuts: false, paused: true, features: { 'BEX-NAV-01': false, 'BEX-CODE-01': true } };
    const result = resolveProfile(DEFAULT_SETTINGS, undefined, DEFAULT_SETTINGS.center, context, { accountId: '1', repositoryId: '7', epoch: 9, preferences });
    expect(validResolvedProfile(result)).toBe(true); expect(resolvedSessionMatches(result, preferences)).toBe(true); expect(resolvedSessionMatches(result)).toBe(false);
    for (const patch of [{ density: 'comfortable' as const }, { shortcuts: true }, { paused: false }, { features: {} }, { features: { ...preferences.features, 'BEX-NAV-01': true } }]) expect(resolvedSessionMatches(result, { ...preferences, ...patch })).toBe(false);
});
it('global saved positive pauses are independent of an explicit false session pause and a non-session scalar cannot claim an override', () => {
    const settings = { ...DEFAULT_SETTINGS, paused: true }; const result = resolveProfile(settings, undefined, settings.center, context);
    expect(resolvedSessionMatches(result, { paused: false })).toBe(true); expect(resolvedSessionMatches(result, { density: 'comfortable' })).toBe(false); expect(resolvedSessionMatches(result, { shortcuts: false })).toBe(false);
});
it('an effective named profile is accepted as a preference source while malformed profile selectors and non-text sources are refused', () => {
    const center = { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: 'Work', scope: { kind: 'global' as const }, preferences: { density: 'compact' as const } }], selected: ['work'] };
    const result = resolveProfile(DEFAULT_SETTINGS, undefined, center, context);
    expect(result.sources.density).toBe('profile:work'); expect(validResolvedProfile(result)).toBe(true);
    for (const source of ['profile:', 'profile:private/name', null, 7]) expect(resolvedPreferenceSource(source)).toBe(false);
});
