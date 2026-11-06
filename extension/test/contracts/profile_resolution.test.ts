import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { EMPTY_PROFILES, type CenterProfile, type ProfileScope } from '../../src/domain/center_profiles.ts';
import { resolveProfile, type ProfileContext } from '../../src/domain/profile_resolution.ts';

const context: ProfileContext = { host: 'github.com', accountId: '7', organizationId: '11', repositoryId: '42', sessionEpoch: 1 };
const session = (preferences: CenterProfile['preferences']) => ({ accountId: '7', repositoryId: '42', epoch: 1, preferences });
const make = (id: string, scope: ProfileScope, preferences: CenterProfile['preferences']): CenterProfile => ({ id, name: id, scope, preferences });
const profiles: CenterProfile[] = [make('global', { kind: 'global' }, { features: { 'BEX-NAV-01': false } }),
    make('host', { kind: 'host', host: 'github.com' }, { density: 'compact' }),
    make('account', { kind: 'account', host: 'github.com', accountId: '7' }, { shortcuts: true }),
    make('org', { kind: 'organization', host: 'github.com', accountId: '7', organizationId: '11' }, { features: { 'BEX-NAV-01': true } }),
    make('repo', { kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42' }, { density: 'comfortable' })];
const selection = { profiles, selected: profiles.map(profile => profile.id) };

it('bexh3-center-C02 explains the winning repository override without losing other inherited values', () => {
    const result = resolveProfile(DEFAULT_SETTINGS, { shortcuts: false, features: { 'BEX-NAV-02': false } }, selection, context);
    expect(result).toMatchObject({ density: 'comfortable', shortcuts: false, paused: false,
        features: { 'BEX-NAV-01': true, 'BEX-NAV-02': false }, sources: { density: 'profile:repo', shortcuts: 'repository',
            features: { 'BEX-NAV-01': 'profile:org', 'BEX-NAV-02': 'repository', 'BEX-NAV-03': 'default' } } });
    expect(Object.keys(result.features)).toHaveLength(150);
});
it('bexh3-center-C03 falls back through host/account/global defaults with precise provenance', () => {
    const result = resolveProfile(DEFAULT_SETTINGS, undefined, { ...selection, selected: ['global', 'host', 'account'] }, context);
    expect(result).toMatchObject({ density: 'compact', shortcuts: true,
        features: { 'BEX-NAV-01': false }, sources: { density: 'profile:host', shortcuts: 'profile:account', features: { 'BEX-NAV-01': 'profile:global' } } });
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, EMPTY_PROFILES, context)).toMatchObject({ density: 'comfortable', shortcuts: false,
        sources: { density: 'global', shortcuts: 'global', paused: 'default' } });
});
it('account and numeric repository isolation prevents a foreign or renamed target inheriting scoped preferences', () => {
    for (const accountId of ['8', null]) expect(resolveProfile(DEFAULT_SETTINGS, undefined, selection, { ...context, accountId }))
        .toMatchObject({ density: 'compact', shortcuts: false, features: { 'BEX-NAV-01': false } });
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, selection, { ...context, repositoryId: '43' })).toMatchObject({ density: 'compact' });
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, selection, { ...context, organizationId: '12' })).toMatchObject({ features: { 'BEX-NAV-01': false } });
    // Display names deliberately do not occur in context, so rename cannot change matching.
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, selection, { ...context })).toEqual(resolveProfile(DEFAULT_SETTINGS, undefined, selection, context));
});
it('rejects a foreign host even when the remaining profile identities coincide', () => {
    const foreign = { ...context, host: 'other.invalid' } as unknown as ProfileContext;
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, selection, foreign)).toMatchObject({ density: 'comfortable', shortcuts: false,
        features: { 'BEX-NAV-01': false }, sources: { density: 'global' } });
});
it('session preference overrides are transient and do not grant connection or rewrite persistent profiles', () => {
    const before = JSON.stringify(selection);
    const result = resolveProfile(DEFAULT_SETTINGS, undefined, selection, context,
        session({ density: 'compact', shortcuts: false, features: { 'BEX-NAV-01': false } }));
    expect(result).toMatchObject({ density: 'compact', shortcuts: false, sources: { density: 'session', shortcuts: 'session', features: { 'BEX-NAV-01': 'session' } } });
    expect(result).not.toHaveProperty('connected'); expect(JSON.stringify(selection)).toBe(before);
    expect(Object.isFrozen(result.sources.features)).toBe(true);
});
it('pause always wins over later enabled preferences and reports the highest active pause source', () => {
    const global = { ...DEFAULT_SETTINGS, paused: true };
    const pausedProfiles = { profiles: [make('paused', { kind: 'global' }, { paused: true })], selected: ['paused'] };
    expect(resolveProfile(global, { paused: false }, EMPTY_PROFILES, context, session({ paused: false }))).toMatchObject({ paused: true, sources: { paused: 'global' } });
    expect(resolveProfile(DEFAULT_SETTINGS, { paused: true }, pausedProfiles, context)).toMatchObject({ paused: true, sources: { paused: 'repository' } });
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, pausedProfiles, context)).toMatchObject({ paused: true, sources: { paused: 'profile:paused' } });
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, EMPTY_PROFILES, context, session({ paused: true }))).toMatchObject({ paused: true, sources: { paused: 'session' } });
    expect(resolveProfile(global, undefined, EMPTY_PROFILES, context, undefined, true)).toMatchObject({ paused: true, sources: { paused: 'tab' } });
    expect(resolveProfile(global, undefined, EMPTY_PROFILES, context, undefined, true, true)).toMatchObject({ paused: true, sources: { paused: 'emergency' } });
});
it('never reuses a session override across a changed account, repository, host or credential epoch', () => {
    const override = session({ density: 'compact', shortcuts: true });
    const before = JSON.stringify(override);
    for (const changed of [{ accountId: '8' }, { accountId: null }, { repositoryId: '43' }, { repositoryId: null },
        { sessionEpoch: 2 }, { sessionEpoch: null }, { host: 'other.invalid' }]) {
        expect(resolveProfile(DEFAULT_SETTINGS, undefined, EMPTY_PROFILES, { ...context, ...changed } as ProfileContext, override))
            .toMatchObject({ density: 'comfortable', shortcuts: false, sources: { density: 'global', shortcuts: 'global' } });
    }
    expect(JSON.stringify(override)).toBe(before);
});
it('selection order never changes the documented scope precedence or mutates the supplied preferences', () => {
    const result = resolveProfile(DEFAULT_SETTINGS, undefined, selection, context);
    expect(resolveProfile(DEFAULT_SETTINGS, undefined, { profiles: [...profiles].reverse(), selected: [...selection.selected].reverse() }, context)).toEqual(result);
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true); expect(Object.isFrozen(profiles)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
});
