import type { Settings } from './settings.ts';
import type { CenterRoute, CenterLocation } from './center_routes.ts';
import { centerLocationHash } from './center_routes.ts';
import { FEATURE_METADATA } from './feature_metadata.ts';
import { FEATURE_MILESTONES, type FeatureMetadata } from './feature_metadata_types.ts';
import { featureText } from './feature_text.ts';
import { navigationCopy } from './navigation_copy.ts';
import { deepFreeze } from './value.ts';

interface Link { readonly label: string; readonly location: CenterLocation }
export interface NavigationFeature extends Link { readonly id: string; readonly milestone: number; readonly issue: number }
export interface LocalWorkspace {
    readonly favorites: readonly NavigationFeature[]; readonly profiles: readonly Link[];
    readonly groups: readonly (Link & { readonly selected: boolean; readonly references: number })[];
}
export interface LocalAttention extends Link { readonly kind: 'globalPause' | 'onboarding' | 'profilePause'; readonly destination: 'overview' | 'welcome' | 'profiles' }
const roadmap = (family: 'WORK' | 'COPILOT' | 'SETUP') => Object.freeze({ milestone: FEATURE_MILESTONES[family], issue: FEATURE_MILESTONES[family] + 701,
    referenceFeature: FEATURE_METADATA.find(feature => feature.family === family)!.id });
export const LOCAL_WORK_DEPENDENCY = roadmap('WORK');
function guide(feature: FeatureMetadata, locale: string): NavigationFeature {
    const milestone = FEATURE_MILESTONES[feature.family];
    return { id: feature.id, label: featureText(feature, navigationCopy(locale).locale)[0],
        location: { route: 'features', detail: feature.id }, milestone, issue: milestone + 701 };
}
/** Authored choices only; this projection has no credential, identity, provider or effective-scope input. */
export function localWorkspace(settings: Settings, locale: string): LocalWorkspace {
    return deepFreeze({ favorites: settings.center.favorites.flatMap(id => {
        const feature = FEATURE_METADATA.find(candidate => candidate.id === id); return feature ? [guide(feature, locale)] : [];
    }), profiles: settings.center.selected.flatMap(id => {
        const profile = settings.center.profiles.find(candidate => candidate.id === id);
        const href = profile ? centerLocationHash({ route: 'profiles', detail: profile.id }) : null;
        return profile && href ? [{ label: profile.name, location: { route: 'profiles' as const, detail: profile.id } }] : [];
    }), groups: settings.center.workspaces.map(group => ({ label: group.name, location: { route: 'repositories' as const, detail: 'workspaces' },
        selected: group.id === settings.center.selectedWorkspace, references: group.members.length })) });
}
/** Review candidates from a committed revision; an empty list never certifies external health. */
export function localAttention(settings: Settings): readonly LocalAttention[] {
    const items: LocalAttention[] = [];
    if (settings.paused) items.push({ kind: 'globalPause', destination: 'overview', label: '', location: { route: 'overview' } });
    if (settings.center.onboarding !== 'complete') items.push({ kind: 'onboarding', destination: 'welcome', label: '', location: { route: 'welcome' } });
    for (const id of settings.center.selected) {
        const profile = settings.center.profiles.find(candidate => candidate.id === id);
        const href = profile ? centerLocationHash({ route: 'profiles', detail: profile.id }) : null;
        if (profile?.preferences.paused === true && href) items.push({ kind: 'profilePause', destination: 'profiles', label: profile.name, location: { route: 'profiles', detail: profile.id } });
    }
    return deepFreeze(items);
}
export function dependencyNavigation(route: CenterRoute, locale: string) {
    const family = route === 'copilot' ? 'COPILOT' : route === 'setup' ? 'SETUP' : null;
    if (family === null) return null;
    return deepFreeze({ ...roadmap(family), features: FEATURE_METADATA.filter(feature => feature.family === family).map(feature => guide(feature, locale)),
        tools: family === 'COPILOT' ? ['connections', 'privacy', 'diagnostics', 'features'] as const : ['profiles', 'data', 'privacy', 'welcome'] as const });
}
