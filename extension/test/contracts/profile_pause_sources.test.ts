import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { resolveProfile, type ProfileContext } from '../../src/domain/profile_resolution.ts';
import type { CenterProfile, ProfileScope } from '../../src/domain/center_profiles.ts';

const context: ProfileContext = { host: 'github.com', accountId: '1', organizationId: '2', repositoryId: '3', sessionEpoch: 4 };
const scopes: readonly ProfileScope[] = [{ kind: 'global' }, { kind: 'host', host: 'github.com' },
    { kind: 'account', host: 'github.com', accountId: '1' }, { kind: 'organization', host: 'github.com', accountId: '1', organizationId: '2' },
    { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '3' }];
const sources = ['global', 'profile:p-global', 'profile:p-host', 'profile:p-account', 'profile:p-organization', 'repository', 'profile:p-repository', 'session', 'tab', 'emergency'];
function resolve(bits: readonly boolean[], page = context) {
    const profiles: CenterProfile[] = scopes.map((scope, index) => ({ id: `p-${scope.kind}`, name: 'Private local name', scope, preferences: { paused: bits[index === 4 ? 6 : index + 1] } }));
    return resolveProfile({ ...DEFAULT_SETTINGS, paused: bits[0] }, { paused: bits[5] }, { profiles, selected: profiles.map(p => p.id) }, page,
        { accountId: '1', repositoryId: '3', epoch: 4, preferences: { paused: bits[7] } }, bits[8], bits[9]);
}
it('all ten applicable positive layers remain explained after the highest-priority emergency wins', () => {
    const value = resolve(Array(10).fill(true)); expect(value.pauseSources).toEqual(sources); expect(value.sources.paused).toBe('emergency'); expect(value.paused).toBe(true);
    expect(Object.isFrozen(value.pauseSources)).toBe(true); expect(JSON.stringify(value.pauseSources)).not.toContain('Private local name');
});
it.each(sources.map((source, index) => ({ source, index })))('one positive $source remains active when every more specific layer explicitly says false', ({ source, index }) => {
    const bits = Array<boolean>(10).fill(false); bits[index] = true; const value = resolve(bits);
    expect(value.pauseSources).toEqual([source]); expect(value.sources.paused).toBe(source); expect(value.paused).toBe(true);
});
it('an entirely unpaused context has no active source, never an invented global or native pause', () => {
    const value = resolve(Array(10).fill(false)); expect(value.pauseSources).toEqual([]); expect(value.paused).toBe(false); expect(value.sources.paused).toBe('default');
});
it('all 1024 valid pause combinations preserve the same monotonic value, complete ordered source set and winning layer', () => {
    for (let mask = 0; mask < 1024; mask++) {
        const bits = sources.map((_, bit) => (mask & (1 << bit)) !== 0); const value = resolve(bits); const active = sources.filter((_, index) => bits[index]);
        expect(value.pauseSources).toEqual(active); expect(value.paused).toBe(active.length > 0); expect(value.sources.paused).toBe(active.at(-1) ?? 'default');
    }
});
it.each([{ accountId: null }, { accountId: '9' }, { organizationId: null }, { organizationId: '9' }, { repositoryId: null }, { repositoryId: '9' }, { sessionEpoch: null }, { sessionEpoch: 5 }])('unavailable or changed context %j cannot introduce an inapplicable profile/session pause', changed => {
    const page = { ...context, ...changed }; const profiles: CenterProfile[] = scopes.slice(2).map(scope => ({ id: `p-${scope.kind}`, name: 'Private local name', scope, preferences: { paused: true } }));
    const value = resolveProfile(DEFAULT_SETTINGS, undefined, { profiles, selected: profiles.map(p => p.id) }, page,
        { accountId: '1', repositoryId: '3', epoch: 4, preferences: { paused: true } });
    if ('accountId' in changed) expect(value.pauseSources).toEqual([]);
    if ('organizationId' in changed) expect(value.pauseSources).not.toContain('profile:p-organization');
    if ('repositoryId' in changed) { expect(value.pauseSources).not.toContain('profile:p-repository'); expect(value.pauseSources).not.toContain('session'); }
    if ('sessionEpoch' in changed) expect(value.pauseSources).not.toContain('session');
});
it('source tracking neither mutates caller collections nor depends on selected array order', () => {
    const profiles: CenterProfile[] = scopes.map(scope => ({ id: `p-${scope.kind}`, name: 'Local', scope, preferences: { paused: true } }));
    const input = { profiles, selected: profiles.map(p => p.id) }; const saved = JSON.stringify(input);
    const value = resolveProfile(DEFAULT_SETTINGS, undefined, input, context); expect(resolveProfile(DEFAULT_SETTINGS, undefined, { profiles: [...profiles].reverse(), selected: [...input.selected].reverse() }, context)).toEqual(value);
    expect(JSON.stringify(input)).toBe(saved); expect(Object.isFrozen(profiles)).toBe(false); expect(Object.isFrozen(value.pauseSources)).toBe(true);
});
