import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { numericIdentity } from './center_profiles.ts';
import { profileScopeApplies, type PreferenceSource, type ProfileContext, type ResolvedProfile } from './profile_resolution.ts';
import type { Settings } from './settings.ts';
import { deepFreeze, natural } from './value.ts';

export const RUNTIME_PREFERENCE_SOURCES = ['default', 'global', 'repository', 'session', 'profile-global', 'profile-host', 'profile-account', 'profile-organization', 'profile-repository'] as const;
export type RuntimePreferenceSource = typeof RUNTIME_PREFERENCE_SOURCES[number];
const PAUSE_ORDER: readonly RuntimePreferenceSource[] = ['global', 'profile-global', 'profile-host', 'profile-account', 'profile-organization', 'repository', 'profile-repository', 'session'];
export function runtimePausesOrdered(sources: readonly RuntimePreferenceSource[]): boolean {
    return sources.every((source, index) => PAUSE_ORDER.indexOf(source) >= 0 && (index === 0 || PAUSE_ORDER.indexOf(sources[index - 1]) < PAUSE_ORDER.indexOf(source)));
}
export interface RuntimePreferenceApplicability { readonly account: boolean; readonly organization: boolean; readonly repository: boolean; readonly session: boolean }
export interface RuntimePreferenceProvenance {
    readonly scope: RuntimePreferenceApplicability;
    readonly density: RuntimePreferenceSource;
    readonly shortcuts: RuntimePreferenceSource;
    readonly features: Readonly<Record<string, RuntimePreferenceSource>>;
    readonly pauses: readonly RuntimePreferenceSource[];
}
/** A generic source code does not confer identity or access; scoped codes need independently verified applicability. */
export function runtimeSourceApplies(source: RuntimePreferenceSource, scope: RuntimePreferenceApplicability): boolean {
    if (source === 'repository' || source === 'profile-repository') return scope.repository;
    if (source === 'profile-account') return scope.account;
    if (source === 'profile-organization') return scope.organization;
    if (source === 'session') return scope.session;
    return true;
}
/** Only generic scope codes cross into content; local IDs/names never leave this projection. */
export function runtimePreferenceProvenance(settings: Settings, context: ProfileContext, resolved: ResolvedProfile): RuntimePreferenceProvenance | null {
    if (context.host !== 'github.com') return null;
    const account = numericIdentity(context.accountId); const repository = account && numericIdentity(context.repositoryId);
    const scope = { account, organization: repository && numericIdentity(context.organizationId), repository,
        session: repository && natural(context.sessionEpoch) };
    const source = (value: PreferenceSource): RuntimePreferenceSource | null => {
        let code: RuntimePreferenceSource;
        if (value === 'default' || value === 'global' || value === 'repository' || value === 'session') code = value;
        else {
            const profile = settings.center.profiles.find(profile => `profile:${profile.id}` === value);
            if (!profile || !settings.center.selected.includes(profile.id) || !profileScopeApplies(profile.scope, context)) return null;
            code = `profile-${profile.scope.kind}`;
        }
        return runtimeSourceApplies(code, scope) ? code : null;
    };
    const density = source(resolved.sources.density); const shortcuts = source(resolved.sources.shortcuts);
    if (!density || !shortcuts || Object.keys(resolved.sources.features).length !== Object.keys(FEATURE_DEFAULTS).length) return null;
    const features: Record<string, RuntimePreferenceSource> = {};
    for (const id of Object.keys(FEATURE_DEFAULTS)) {
        const code = source(resolved.sources.features[id]); if (!code) return null; features[id] = code;
    }
    if (resolved.pauseSources.length > 8) return null;
    const pauses: RuntimePreferenceSource[] = [];
    for (const value of resolved.pauseSources) { const code = source(value); if (!code) return null; pauses.push(code); }
    if (!runtimePausesOrdered(pauses) || resolved.paused !== (pauses.length > 0)) return null;
    return deepFreeze({ scope, density, shortcuts, features, pauses });
}
