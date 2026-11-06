import { copyProfileSelection, type CenterProfile, type ProfileScope } from './center_profiles.ts';
export interface ProfileDraft {
    id: string; name: string; kind: ProfileScope['kind']; accountId: string; organizationId: string; repositoryId: string;
    density: 'inherit' | 'comfortable' | 'compact'; paused: 'inherit' | 'yes' | 'no'; shortcuts: 'inherit' | 'yes' | 'no';
    features: Record<string, boolean>;
}
export function profileDraft(profile?: CenterProfile): ProfileDraft {
    const scope = profile?.scope;
    return { id: profile?.id ?? '', name: profile?.name ?? '', kind: scope?.kind ?? 'global',
        accountId: scope && 'accountId' in scope ? scope.accountId : '',
        organizationId: scope?.kind === 'organization' ? scope.organizationId : '', repositoryId: scope?.kind === 'repository' ? scope.repositoryId : '',
        density: profile?.preferences.density ?? 'inherit', paused: profile?.preferences.paused === undefined ? 'inherit' : profile.preferences.paused ? 'yes' : 'no',
        shortcuts: profile?.preferences.shortcuts === undefined ? 'inherit' : profile.preferences.shortcuts ? 'yes' : 'no',
        features: { ...profile?.preferences.features } };
}
export function draftProfile(draft: ProfileDraft): CenterProfile | null {
    const scope: ProfileScope = draft.kind === 'global' ? { kind: 'global' } : draft.kind === 'host' ? { kind: 'host', host: 'github.com' }
        : draft.kind === 'account' ? { kind: 'account', host: 'github.com', accountId: draft.accountId }
            : draft.kind === 'organization' ? { kind: 'organization', host: 'github.com', accountId: draft.accountId, organizationId: draft.organizationId }
                : { kind: 'repository', host: 'github.com', accountId: draft.accountId, repositoryId: draft.repositoryId };
    const preferences = { ...(Object.keys(draft.features).length ? { features: draft.features } : {}),
        ...(draft.density === 'inherit' ? {} : { density: draft.density }),
        ...(draft.paused === 'inherit' ? {} : { paused: draft.paused === 'yes' }),
        ...(draft.shortcuts === 'inherit' ? {} : { shortcuts: draft.shortcuts === 'yes' }) };
    return copyProfileSelection({ profiles: [{ id: draft.id, name: draft.name, scope, preferences }], selected: [] })?.profiles[0] ?? null;
}
