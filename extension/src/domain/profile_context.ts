import type { ConnectionOutcome, ConnectionSummary } from './named_sessions.ts';
import type { ProfileDraft } from './profile_draft.ts';
import type { ProfileContext } from './profile_resolution.ts';
import { resolveProfile, type PreferenceSource } from './profile_resolution.ts';
import type { Settings } from './settings.ts';
import { deepFreeze } from './value.ts';

export interface ScopeChoice { readonly value: string; readonly label: string; readonly known: boolean }
export function scopeChoiceText(choice: ScopeChoice, unavailable: string): string {
    return choice.known ? choice.label : `${choice.label} · ${unavailable}`;
}
function choices(values: readonly { value: string; label: string }[], retained: string): readonly ScopeChoice[] {
    const entries = new Map(values.map(value => [value.value, { ...value, known: true }]));
    if (retained && !entries.has(retained)) entries.set(retained, { value: retained, label: retained, known: false });
    return [...entries.keys()].sort().map(value => entries.get(value)!);
}
/** Saved provider identities are choices for authored scope; choosing one grants no connection. */
export function profileScopeChoices(view: ConnectionOutcome | null | undefined, draft: ProfileDraft) {
    const entries = view?.state === 'ready' ? view.entries : [];
    const account = entries.filter(entry => entry.viewerId === draft.accountId);
    return deepFreeze({ accounts: choices(entries.map(entry => ({ value: entry.viewerId, label: entry.viewerLogin })), draft.accountId),
        repositories: choices(account.map(entry => ({ value: entry.repositoryId, label: entry.repository })), draft.repositoryId),
        organizations: choices(account.filter(entry => typeof entry.organizationId === 'string')
            .map(entry => ({ value: entry.organizationId!, label: entry.repository.split('/')[0] })), draft.organizationId) });
}
export function selectedProfileContext(view: ConnectionOutcome | null | undefined): { readonly context: ProfileContext; readonly entry: ConnectionSummary | null } {
    const entry = view?.state === 'ready' && view.connected ? view.entries.find(entry => entry.id === view.selected) ?? null : null;
    return deepFreeze({ entry, context: { host: 'github.com', accountId: entry?.viewerId ?? null,
        repositoryId: entry?.repositoryId ?? null, organizationId: entry?.organizationId ?? null, sessionEpoch: null } });
}
export function centerProfileResolution(settings: Settings, view: ConnectionOutcome | null | undefined) {
    const { entry, context } = selectedProfileContext(view);
    return deepFreeze({ entry, preferences: resolveProfile(settings, entry ? settings.repositories[entry.repositoryId] : undefined, settings.center, context) });
}
export function sourceProfileName(source: PreferenceSource, settings: Settings): string | null {
    return source.startsWith('profile:') ? settings.center.profiles.find(profile => `profile:${profile.id}` === source)?.name ?? null : null;
}
export function repositoryPreferenceRows(settings: Settings, view: ConnectionOutcome | null | undefined) {
    const entries = view?.state === 'ready' ? view.entries : [];
    const selected = view?.state === 'ready' ? view.selected : null;
    const unique = new Map<string, ConnectionSummary>();
    for (const entry of entries) if (!unique.has(entry.repositoryId) || entry.id === selected) unique.set(entry.repositoryId, entry);
    return deepFreeze([...unique.values()].map(entry => ({ id: entry.repositoryId, name: entry.repository,
        account: entry.viewerLogin, paused: settings.repositories[entry.repositoryId]?.paused === true })));
}
