import { expect, it } from 'vitest';
import { localWorkspace, localAttention, dependencyNavigation, LOCAL_WORK_DEPENDENCY } from '../../src/domain/local_navigation.ts';
import { navigationCopy } from '../../src/domain/navigation_copy.ts';
import { featureCurrentTools, featureInventory } from '../../src/domain/feature_inventory.ts';
import { FEATURE_METADATA } from '../../src/domain/feature_metadata.ts';
import { featureText } from '../../src/domain/feature_text.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { featureReferenceLink } from '../../src/domain/feature_links.ts';
import { navigationSettings } from '../fixtures/local_navigation.ts';

it('saved favorites preserve user order and use canonical localized feature guides and dependencies rather than activate a capability', () => {
    const settings = navigationSettings(); const view = localWorkspace(settings, 'es');
    expect(view.favorites.map(value => value.id)).toEqual(settings.center.favorites);
    expect(view.favorites[0]).toEqual({ id: 'BEX-CODE-01', label: featureText(FEATURE_METADATA.find(value => value.id === 'BEX-CODE-01')!, 'es')[0], location: { route: 'features', detail: 'BEX-CODE-01' }, milestone: 4, issue: 705 });
    expect(view.favorites[1]).toMatchObject({ location: { route: 'features', detail: 'BEX-CENTER-11' }, milestone: 3, issue: 704 });
    expect(localWorkspace(settings, '__proto__').favorites[0].label).toBe(FEATURE_METADATA.find(value => value.id === 'BEX-CODE-01')!.title);
});
it('selected profiles and authored groups expose only saved labels, exact local destinations and reference counts, without binding identity', () => {
    const settings = navigationSettings(); const before = structuredClone(settings); const view = localWorkspace(settings, 'en');
    expect(view.profiles).toEqual([{ label: 'Work <safe>', location: { route: 'profiles', detail: 'work' } }]);
    expect(view.groups).toEqual([{ label: 'Team <safe>', location: { route: 'repositories', detail: 'workspaces' }, selected: true, references: 2 }]);
    expect(JSON.stringify(view)).not.toMatch(/opaque-session-reference|unbound-0-0|viewerId|repositoryId|credential|connected/);
    expect(settings).toEqual(before); expect(Object.isFrozen(view.groups[0])).toBe(true);
    expect(localWorkspace({ ...settings, center: { ...settings.center, selectedWorkspace: null } }, 'en').groups[0].selected).toBe(false);
});
it('the saved global pause points to its existing reviewed control without claiming that it was changed', () => {
    const settings = { ...DEFAULT_SETTINGS, paused: true, center: { ...DEFAULT_SETTINGS.center, onboarding: 'complete' as const } };
    expect(localAttention(settings)).toEqual([{ kind: 'globalPause', destination: 'overview', label: '', location: { route: 'overview' } }]); expect(settings.paused).toBe(true);
});
it('all incomplete onboarding stages resume the fixed local flow while completion removes that review item', () => {
    for (const stage of ['welcome', 'profile', 'permissions'] as const) {
        expect(localAttention({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: stage } })).toEqual([{ kind: 'onboarding', destination: 'welcome', label: '', location: { route: 'welcome' } }]);
    }
    expect(localAttention({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'complete' } })).toEqual([]);
});
it('only selected profiles with an authored pause become scope-qualified profile review items', () => {
    const settings = navigationSettings(); const items = localAttention(settings);
    expect(items).toEqual([{ kind: 'onboarding', destination: 'welcome', label: '', location: { route: 'welcome' } }, { kind: 'profilePause', destination: 'profiles', label: 'Work <safe>', location: { route: 'profiles', detail: 'work' } }]);
    expect(localAttention({ ...settings, center: { ...settings.center, selected: ['personal'], onboarding: 'complete' } })).toEqual([]);
    expect(Object.isFrozen(items[0])).toBe(true);
});
it('adversarial or stale caller references cannot become an external feature/profile destination', () => {
    const settings = navigationSettings(); const source = { ...settings, center: { ...settings.center, favorites: ['https://untrusted.test'], selected: ['missing', '../secret'],
        profiles: [{ ...settings.center.profiles[0], id: '../secret' }] } };
    const view = localWorkspace(source, 'en'); expect(view.favorites).toEqual([]); expect(view.profiles).toEqual([]);
    expect(localAttention(source).map(item => item.kind)).toEqual(['onboarding']);
});
it('Copilot, Setup and GitHub work use their canonical distinct milestones, capability families and useful current local tools', () => {
    const copilot = dependencyNavigation('copilot', 'fr')!; const setup = dependencyNavigation('setup', 'fr')!;
    expect(copilot).toMatchObject({ milestone: 9, issue: 710, tools: ['connections', 'privacy', 'diagnostics', 'features'] });
    expect(setup).toMatchObject({ milestone: 11, issue: 712, tools: ['profiles', 'data', 'privacy', 'welcome'] });
    expect(featureReferenceLink({ kind: 'milestone', id: copilot.referenceFeature })).toBe('https://github.com/vypdev/copilot/issues/710');
    expect(featureReferenceLink({ kind: 'milestone', id: setup.referenceFeature })).toBe('https://github.com/vypdev/copilot/issues/712');
    expect(copilot.features.map(value => value.id)).toEqual(FEATURE_METADATA.filter(value => value.family === 'COPILOT').map(value => value.id));
    expect(setup.features.map(value => value.id)).toEqual(FEATURE_METADATA.filter(value => value.family === 'SETUP').map(value => value.id));
    expect(LOCAL_WORK_DEPENDENCY.milestone).toBe(6); expect(LOCAL_WORK_DEPENDENCY.issue).toBe(707);
    expect(featureReferenceLink({ kind: 'milestone', id: LOCAL_WORK_DEPENDENCY.referenceFeature })).toBe('https://github.com/vypdev/copilot/issues/707'); expect(dependencyNavigation('work', 'en')).toBeNull();
});
it('every locale is a complete immutable resource and unknown input selects English atomically', () => {
    const english = navigationCopy('en'); expect(navigationCopy('__proto__')).toBe(english);
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const copy = navigationCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(english)); expect(copy.locale).toBe(locale); expect(Object.isFrozen(copy)).toBe(true);
        expect(Object.values(copy).every(value => value.trim().length > 0)).toBe(true);
    }
});
it('feature guides expose actual Activity/Diagnostics tools and keep every privacy/reset scope a separate destination', () => {
    expect(featureCurrentTools('BEX-CENTER-09')).toEqual(['activity']); expect(featureCurrentTools('BEX-CENTER-10')).toEqual(['diagnostics']);
    expect(featureCurrentTools('BEX-CENTER-14')).toEqual(['data', 'privacy', 'connections', 'overview']); expect(Object.isFrozen(featureCurrentTools('BEX-CENTER-14'))).toBe(true);
    expect(featureCurrentTools('__proto__')).toEqual([]); expect(featureCurrentTools('BEX-COPILOT-01')).toEqual([]);
    const rows = featureInventory(null, null, 'en'); expect(rows.find(row => row.id === 'BEX-CENTER-09')?.tools).toBe('activity'); expect(rows.find(row => row.id === 'BEX-CENTER-10')?.tools).toBe('diagnostics');
});
