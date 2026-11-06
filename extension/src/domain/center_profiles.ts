import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { localIdentifier } from './center_routes.ts';
import type { Preferences } from './preferences.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export type ProfileScope = { readonly kind: 'global' }
    | { readonly kind: 'host'; readonly host: 'github.com' }
    | { readonly kind: 'account'; readonly host: 'github.com'; readonly accountId: string }
    | { readonly kind: 'organization'; readonly host: 'github.com'; readonly accountId: string; readonly organizationId: string }
    | { readonly kind: 'repository'; readonly host: 'github.com'; readonly accountId: string; readonly repositoryId: string };
export interface CenterProfile {
    readonly id: string;
    readonly name: string;
    readonly scope: ProfileScope;
    readonly preferences: Partial<Preferences>;
}
export interface ProfileSelection {
    readonly profiles: readonly CenterProfile[];
    readonly selected: readonly string[];
}
export const EMPTY_PROFILES: ProfileSelection = deepFreeze({ profiles: [], selected: [] });
export const numericIdentity = (value: unknown): value is string => typeof value === 'string'
    && /^[1-9]\d{0,19}$(?![\s\S])/u.test(value);

export function validProfileScope(value: unknown): value is ProfileScope {
    if (!record(value)) return false;
    if (value.kind === 'global') return Object.keys(value).length === 1;
    if (value.host !== 'github.com') return false;
    if (value.kind === 'host') return keys(value, ['kind', 'host']);
    if (!numericIdentity(value.accountId)) return false;
    if (value.kind === 'account') return keys(value, ['kind', 'host', 'accountId']);
    if (value.kind === 'organization') return keys(value, ['kind', 'host', 'accountId', 'organizationId'])
        && numericIdentity(value.organizationId);
    return value.kind === 'repository' && keys(value, ['kind', 'host', 'accountId', 'repositoryId'])
        && numericIdentity(value.repositoryId);
}

/** Profiles are preferences only: connection, permission and approval fields never qualify. */
export function validProfilePreferences(value: unknown): value is Partial<Preferences> {
    if (!record(value) || !keys(value, ['features', 'density', 'shortcuts', 'paused'])) return false;
    if (Object.hasOwn(value, 'features') && (!record(value.features) || !Object.entries(value.features)
        .every(([id, enabled]) => Object.hasOwn(FEATURE_DEFAULTS, id) && typeof enabled === 'boolean'))) return false;
    if (Object.hasOwn(value, 'density') && !['comfortable', 'compact'].includes(value.density as string)) return false;
    return ['shortcuts', 'paused'].every(key => !Object.hasOwn(value, key) || typeof value[key] === 'boolean');
}

export function profileScopeKey(scope: ProfileScope): string {
    if (scope.kind === 'global') return 'global';
    if (scope.kind === 'host') return 'github.com';
    const account = `github.com/${scope.accountId}`;
    if (scope.kind === 'account') return account;
    return scope.kind === 'organization' ? `${account}/org/${scope.organizationId}` : `${account}/repo/${scope.repositoryId}`;
}

export function validProfileSelection(value: unknown): value is ProfileSelection {
    if (!record(value) || !keys(value, ['profiles', 'selected']) || !Array.isArray(value.profiles)
        || !Array.isArray(value.selected) || value.profiles.length > 10 || value.selected.length > 10
        || !jsonBytesWithin(value, 65536)) return false;
    const ids = new Set<string>();
    for (const profile of value.profiles) {
        if (!record(profile) || !keys(profile, ['id', 'name', 'scope', 'preferences'])
            || !localIdentifier(profile.id) || ids.has(profile.id) || typeof profile.name !== 'string'
            || profile.name.length < 1 || profile.name.length > 60 || profile.name.trim() !== profile.name
            || /[\p{Cc}\p{Cf}]/u.test(profile.name) || !validProfileScope(profile.scope)
            || !validProfilePreferences(profile.preferences)) return false;
        ids.add(profile.id);
    }
    const selectedIds = new Set<string>(); const scopes = new Set<string>();
    for (const id of value.selected) {
        if (typeof id !== 'string' || !ids.has(id) || selectedIds.has(id)) return false;
        const profile = (value.profiles as CenterProfile[]).find(profile => profile.id === id)!;
        const scope = profileScopeKey(profile.scope);
        if (scopes.has(scope)) return false;
        scopes.add(scope); selectedIds.add(id);
    }
    return true;
}

export function copyProfileSelection(value: unknown): ProfileSelection | null {
    return validProfileSelection(value) ? deepFreeze(JSON.parse(JSON.stringify(value)) as ProfileSelection) : null;
}
