import { expect, it } from 'vitest';
import { copyProfileSelection, EMPTY_PROFILES, numericIdentity, profileScopeKey, validProfilePreferences,
    validProfileScope, validProfileSelection, type CenterProfile, type ProfileScope } from '../../src/domain/center_profiles.ts';

const scopes: ProfileScope[] = [{ kind: 'global' }, { kind: 'host', host: 'github.com' },
    { kind: 'account', host: 'github.com', accountId: '7' },
    { kind: 'organization', host: 'github.com', accountId: '7', organizationId: '11' },
    { kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42' }];
const profile = (id = 'personal', scope: ProfileScope = scopes[0]): CenterProfile =>
    ({ id, name: 'My profile', scope, preferences: { features: { 'BEX-NAV-01': false }, density: 'compact', shortcuts: false, paused: true } });

it('bexh3-center-C26 accepts bounded complete nonsecret profiles at each defined scope', () => {
    expect(validProfileSelection(EMPTY_PROFILES)).toBe(true);
    expect(validProfileSelection({ profiles: [], selected: [] })).toBe(true);
    for (const scope of scopes) expect(validProfileSelection({ profiles: [profile('personal', scope)], selected: ['personal'] })).toBe(true);
    expect(scopes.map(profileScopeKey)).toEqual(['global', 'github.com', 'github.com/7', 'github.com/7/org/11', 'github.com/7/repo/42']);
    expect(validProfilePreferences({})).toBe(true);
    expect(validProfilePreferences({ density: 'comfortable', shortcuts: true, paused: false })).toBe(true);
});
it('bexh3-center-C04 rejects malformed scopes and identities rather than accepting names as authority', () => {
    for (const value of [undefined, null, [], { kind: 'global', extra: true }, { kind: 'host', host: 'other.invalid' },
        { kind: 'host', host: 'github.com', accountId: '7' }, { kind: 'account', host: 'github.com', accountId: '0' },
        { kind: 'account', host: 'github.com', accountId: '7', extra: true },
        { kind: 'organization', host: 'github.com', accountId: '7', organizationId: 'octo' },
        { kind: 'organization', host: 'github.com', accountId: '7', organizationId: '11', repositoryId: '42' },
        { kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42\n' },
        { kind: 'repository', host: 'github.com', accountId: '7', repositoryId: '42', extra: true },
        { kind: 'session', host: 'github.com', accountId: '7' }]) expect(validProfileScope(value)).toBe(false);
    expect(numericIdentity('99999999999999999999')).toBe(true);
    for (const value of ['0', '1'.repeat(21), '', 7, null, '7\n']) expect(numericIdentity(value)).toBe(false);
});
it('bexhub-SEC-C03 cannot import credential, connection, command, permission or approval authority as a preference', () => {
    for (const value of [null, [], { connected: true }, { permission: 'api' }, { secret: 'synthetic-secret' },
        { command: 'apply' }, { approval: true }, { density: 'giant' }, { density: undefined },
        { shortcuts: 'yes' }, { shortcuts: undefined }, { paused: null }, { features: null },
        { features: [] }, { features: { 'BEX-UNKNOWN-01': true } }, { features: { 'BEX-NAV-01': 'yes' } }]) {
        expect(validProfilePreferences(value)).toBe(false);
    }
});
it('rejects incomplete, extra-key and malformed profile collections atomically', () => {
    for (const value of [null, [], {}, { profiles: [] }, { profiles: {}, selected: [] }, { profiles: [], selected: {} },
        { profiles: [], selected: [], extra: true }, { profiles: [null], selected: [] },
        { profiles: [{ ...profile(), extra: true }], selected: [] },
        { profiles: [{ ...profile(), id: 'Invalid' }], selected: [] },
        { profiles: [{ ...profile(), name: 1 }], selected: [] },
        { profiles: [{ ...profile(), scope: {} }], selected: [] },
        { profiles: [{ ...profile(), preferences: { connected: true } }], selected: [] }]) expect(validProfileSelection(value)).toBe(false);
});
it('bounds authored profile names while preserving original non-executable Unicode text', () => {
    for (const name of ['', 'a'.repeat(61), ' padded', 'padded ', 'a\n', 'a\u202e']) {
        expect(validProfileSelection({ profiles: [{ ...profile(), name }], selected: [] })).toBe(false);
    }
    for (const name of ['Revisión accesible', 'a'.repeat(60), '<script>inert text</script>']) {
        expect(validProfileSelection({ profiles: [{ ...profile(), name }], selected: [] })).toBe(true);
    }
});
it('enforces ten profiles and ten selections without truncating or deduplicating authored data', () => {
    const profiles = Array.from({ length: 10 }, (_, index) => profile(`profile-${index}`, {
        kind: 'repository', host: 'github.com', accountId: '7', repositoryId: String(index + 1) }));
    const selected = profiles.map(profile => profile.id);
    expect(validProfileSelection({ profiles, selected })).toBe(true);
    expect(validProfileSelection({ profiles: [...profiles, profile('extra')], selected })).toBe(false);
    expect(validProfileSelection({ profiles, selected: [...selected, 'extra'] })).toBe(false);
    expect(validProfileSelection({ profiles: [profile(), profile()], selected: [] })).toBe(false);
});
it('requires unique selected IDs, existing references and one selected profile per exact scope', () => {
    const profiles = [profile('one'), profile('two')];
    for (const selected of [['unknown'], [null], ['one', 'one'], ['one', 'two']]) {
        expect(validProfileSelection({ profiles, selected })).toBe(false);
    }
    expect(validProfileSelection({ profiles, selected: ['two'] })).toBe(true);
    expect(validProfileSelection({ profiles: [profile('one', scopes[2]), profile('two', {
        kind: 'account', host: 'github.com', accountId: '8' })], selected: ['one', 'two'] })).toBe(true);
});
it('bounds encoded settings bytes and rejects cycles before copying or freezing', () => {
    const features = Object.fromEntries(Array.from({ length: 2000 }, (_, index) => [`unknown-${index}`, true]));
    expect(validProfileSelection({ profiles: [{ ...profile(), preferences: { features } }], selected: [] })).toBe(false);
    const cyclic: Record<string, unknown> = { profiles: [], selected: [] }; cyclic.profiles = [cyclic];
    expect(validProfileSelection(cyclic)).toBe(false); expect(copyProfileSelection(cyclic)).toBeNull();
});
it('copies a complete validated selection without freezing or retaining mutable caller state', () => {
    const input = { profiles: [profile()], selected: ['personal'] }; const copy = copyProfileSelection(input)!;
    expect(copy).toEqual(input); expect(copy).not.toBe(input);
    expect(Object.isFrozen(copy.profiles[0].scope)).toBe(true);
    expect(Object.isFrozen(copy.profiles[0].preferences.features)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    input.profiles[0] = profile('changed'); expect(copy.profiles[0].id).toBe('personal');
});
