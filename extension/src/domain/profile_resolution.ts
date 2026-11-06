import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import type { Preferences, RepositoryPreferences } from './preferences.ts';
import type { ProfileScope, ProfileSelection } from './center_profiles.ts';
import { deepFreeze } from './value.ts';

export interface ProfileContext {
    readonly host: 'github.com';
    readonly accountId: string | null;
    readonly organizationId: string | null;
    readonly repositoryId: string | null;
    readonly sessionEpoch: number | null;
}
export interface SessionProfile {
    readonly accountId: string;
    readonly repositoryId: string;
    readonly epoch: number;
    readonly preferences: Partial<Preferences>;
}
export type PreferenceSource = 'default' | 'global' | 'repository' | 'session' | 'tab' | 'emergency' | `profile:${string}`;
export interface ResolvedProfile extends Preferences {
    readonly pauseSources: readonly PreferenceSource[];
    readonly sources: {
        readonly density: PreferenceSource;
        readonly shortcuts: PreferenceSource;
        readonly paused: PreferenceSource;
        readonly features: Readonly<Record<string, PreferenceSource>>;
    };
}
export function profileScopeApplies(scope: ProfileScope, context: ProfileContext): boolean {
    if (scope.kind === 'global') return true;
    if (scope.host !== context.host) return false;
    if (scope.kind === 'host') return true;
    if (scope.accountId !== context.accountId) return false;
    if (scope.kind === 'account') return true;
    return scope.kind === 'organization' ? scope.organizationId === context.organizationId : scope.repositoryId === context.repositoryId;
}

/** Inputs are validated preferences and verified context, never names inferred from page text. */
export function resolveProfile(global: Preferences, repository: RepositoryPreferences | undefined, selection: ProfileSelection,
    context: ProfileContext, session?: SessionProfile, tabPaused = false, emergency = false): ResolvedProfile {
    const features = { ...FEATURE_DEFAULTS };
    const featureSources: Record<string, PreferenceSource> = Object.fromEntries(Object.keys(features).map(id => [id, 'default']));
    let density: Preferences['density'] = 'comfortable'; let shortcuts = false; let paused = false;
    let densitySource: PreferenceSource = 'default'; let shortcutsSource: PreferenceSource = 'default';
    let pauseSource: PreferenceSource = 'default';
    const pauseSources: PreferenceSource[] = [];
    const apply = (patch: Partial<Preferences>, source: PreferenceSource) => {
        if (patch.density !== undefined) { density = patch.density; densitySource = source; }
        if (patch.shortcuts !== undefined) { shortcuts = patch.shortcuts; shortcutsSource = source; }
        if (patch.paused === true) { paused = true; pauseSource = source; pauseSources.push(source); }
        for (const [id, enabled] of Object.entries(patch.features ?? {})) { features[id] = enabled; featureSources[id] = source; }
    };
    apply(global, 'global');
    for (const kind of ['global', 'host', 'account', 'organization', 'repository'] as const) {
        if (kind === 'repository' && repository) apply(repository, 'repository');
        const profile = selection.profiles.find(profile => profile.scope.kind === kind
            && selection.selected.includes(profile.id) && profileScopeApplies(profile.scope, context));
        if (profile) apply(profile.preferences, `profile:${profile.id}`);
    }
    if (session && context.host === 'github.com' && context.accountId === session.accountId
        && context.repositoryId === session.repositoryId && context.sessionEpoch === session.epoch) apply(session.preferences, 'session');
    if (tabPaused) { paused = true; pauseSource = 'tab'; pauseSources.push('tab'); }
    if (emergency) { paused = true; pauseSource = 'emergency'; pauseSources.push('emergency'); }
    return deepFreeze({ features, density, shortcuts, paused, pauseSources, sources: {
        density: densitySource, shortcuts: shortcutsSource, paused: pauseSource, features: featureSources } });
}
