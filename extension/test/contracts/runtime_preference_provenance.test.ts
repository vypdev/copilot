import { expect, it } from 'vitest';
import { runtimePreferenceProvenance as project, runtimePausesOrdered, runtimeSourceApplies } from '../../src/domain/runtime_preference_provenance.ts';
import { resolveProfile, type PreferenceSource, type ProfileContext } from '../../src/domain/profile_resolution.ts';
import { preferenceProvenanceFixture as fixture } from '../fixtures/runtime_provenance.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

it('projects all 150 feature sources and all eight applicable saved pause layers without private labels, IDs or caller mutation', () => {
    const h = fixture(); const saved = JSON.stringify(h.settings); const result = project(h.settings, h.context, h.resolved)!;
    expect(result.pauses).toEqual(['global', 'profile-global', 'profile-host', 'profile-account', 'profile-organization', 'repository', 'profile-repository', 'session']);
    expect(result.scope).toEqual({ account: true, organization: true, repository: true, session: true }); expect(Object.keys(result.features)).toHaveLength(150);
    expect(result.density).toBe('profile-repository'); expect(result.shortcuts).toBe('profile-repository'); expect(result.features['BEX-NAV-01']).toBe('profile-repository');
    expect(Object.isFrozen(result.features)).toBe(true); expect(JSON.stringify(result)).not.toContain('private-'); expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(JSON.stringify(h.settings)).toBe(saved); expect(Object.isFrozen(h.profiles)).toBe(false);
});
it.each(['global', 'host', 'account', 'organization', 'repository'] as const)('the selected %s profile becomes only a generic scope code', kind => {
    const h = fixture(); const profile = h.profiles.find(profile => profile.scope.kind === kind)!;
    const settings = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: [profile.id] } };
    const resolved = resolveProfile(settings, undefined, settings.center, h.context); const value = project(settings, h.context, resolved)!;
    expect(value.pauses).toEqual([`profile-${kind}`]); expect(value.features['BEX-NAV-01']).toBe(`profile-${kind}`); expect(JSON.stringify(value)).not.toContain(profile.id); expect(JSON.stringify(value)).not.toContain(profile.name);
});
it('global, repository, session and feature-default sources remain distinct without transferring any identity values', () => {
    const h = fixture(); const settings = { ...DEFAULT_SETTINGS, repositories: { '7': { density: 'compact' as const } } };
    const resolved = resolveProfile(settings, settings.repositories['7'], settings.center, h.context,
        { accountId: '1', repositoryId: '7', epoch: 9, preferences: { shortcuts: true } });
    expect(project(settings, h.context, resolved)).toMatchObject({ density: 'repository', shortcuts: 'session', features: { 'BEX-NAV-01': 'default' }, pauses: [] });
});
it.each(['repository', 'profile-repository', 'profile-account', 'profile-organization', 'session'] as const)('a %s code alone never creates its required verified applicability', code => {
    expect(runtimeSourceApplies(code, { account: false, repository: false, organization: false, session: false })).toBe(false);
    expect(runtimeSourceApplies(code, { account: true, repository: true, organization: true, session: true })).toBe(true);
});
it.each(['default', 'global', 'profile-global', 'profile-host'] as const)('%s remains applicable to the standalone github.com context', code => { expect(runtimeSourceApplies(code, { account: false, repository: false, organization: false, session: false })).toBe(true); });
it.each([{ host: 'foreign.test' }, { accountId: null }, { accountId: '8' }, { repositoryId: null }, { repositoryId: '8' }, { organizationId: null }, { organizationId: '8' }, { sessionEpoch: null }, { sessionEpoch: NaN }])('a supplied old resolved view cannot be projected into changed context %j', patch => {
    const h = fixture(); expect(project(h.settings, { ...h.context, ...patch } as ProfileContext, h.resolved)).toBeNull();
});
it('a source profile must still exist, be selected and match the exact verified scope before its generic label is projected', () => {
    const h = fixture(); for (const center of [{ ...h.settings.center, profiles: [] }, { ...h.settings.center, selected: [] }]) expect(project({ ...h.settings, center }, h.context, h.resolved)).toBeNull();
});
it.each(['tab', 'emergency', 'profile:missing'] as PreferenceSource[])('unsupported scalar source %s cannot turn a private or native marker into a saved-preference explanation', code => {
    const h = fixture(); expect(project(h.settings, h.context, { ...h.resolved, sources: { ...h.resolved.sources, density: code } })).toBeNull();
    expect(project(h.settings, h.context, { ...h.resolved, sources: { ...h.resolved.sources, shortcuts: code } })).toBeNull();
});
it('missing, replaced and unknown feature sources are rejected without returning a partial feature inventory', () => {
    const h = fixture(); const missing = { ...h.resolved.sources.features }; delete missing['BEX-NAV-01'];
    for (const features of [missing, { ...missing, foreign: 'default' }, { ...h.resolved.sources.features, 'BEX-NAV-01': 'tab' }]) {
        expect(project(h.settings, h.context, { ...h.resolved, sources: { ...h.resolved.sources, features: features as Record<string, PreferenceSource> } })).toBeNull();
    }
});
it.each(([['default'], ['global', 'global'], ['repository', 'global']] as const).map(pauses => ({ pauses })))('default, duplicate and reversed pause source order $pauses cannot disguise monotonic provenance', ({ pauses }) => {
    const h = fixture(); expect(runtimePausesOrdered(pauses)).toBe(false); expect(project(h.settings, h.context, { ...h.resolved, pauseSources: pauses })).toBeNull();
});
it('missing, foreign and oversized pause source collections or inconsistent pause values fail closed', () => {
    const h = fixture(); for (const pauseSources of [[], ['tab'], Array(9).fill('global')]) expect(project(h.settings, h.context, { ...h.resolved, pauseSources: pauseSources as PreferenceSource[] })).toBeNull();
    expect(project(h.settings, h.context, { ...h.resolved, paused: false })).toBeNull();
});
