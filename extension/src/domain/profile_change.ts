import { copyProfileSelection, profileScopeKey, type CenterProfile, type ProfileSelection } from './center_profiles.ts';
import { localIdentifier } from './center_routes.ts';
import { deepFreeze, keys, record } from './value.ts';

export interface ProfileChangeRow {
    readonly profileId: string;
    readonly field: 'name' | 'scope' | 'selected' | 'density' | 'shortcuts' | 'paused' | `feature:${string}`;
    readonly before: string | boolean | null;
    readonly after: string | boolean | null;
}
export type ProfileChangePlan = { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'not-found' | 'capacity' | 'conflicting-scopes' }
    | { readonly state: 'unchanged' }
    | { readonly state: 'ready'; readonly action: 'create' | 'edit' | 'select' | 'deselect' | 'remove';
        readonly next: ProfileSelection; readonly changes: readonly ProfileChangeRow[] };

/** Complete semantic delta, including removals/inherited values; no silent row truncation. */
export function profileChanges(before: ProfileSelection, after: ProfileSelection): readonly ProfileChangeRow[] {
    const changes: ProfileChangeRow[] = [];
    for (const id of [...new Set([...before.profiles, ...after.profiles].map(profile => profile.id))].sort()) {
        const previous = before.profiles.find(profile => profile.id === id);
        const next = after.profiles.find(profile => profile.id === id);
        const add = (field: ProfileChangeRow['field'], old: ProfileChangeRow['before'], value: ProfileChangeRow['after']) => {
            if (old !== value) changes.push({ profileId: id, field, before: old, after: value });
        };
        add('name', previous?.name ?? null, next?.name ?? null);
        add('scope', previous ? profileScopeKey(previous.scope) : null, next ? profileScopeKey(next.scope) : null);
        for (const field of ['density', 'shortcuts', 'paused'] as const) add(field,
            previous?.preferences[field] ?? null, next?.preferences[field] ?? null);
        const oldFeatures = previous?.preferences.features ?? {}; const features = next?.preferences.features ?? {};
        for (const feature of [...new Set([...Object.keys(oldFeatures), ...Object.keys(features)])].sort()) {
            add(`feature:${feature}`, oldFeatures[feature] ?? null, features[feature] ?? null);
        }
        add('selected', before.selected.includes(id), after.selected.includes(id));
    }
    return deepFreeze(changes);
}

/** Planning is pure. Application must bind this result to a current revision before confirmation. */
export function planProfileChange(current: unknown, intent: unknown): ProfileChangePlan {
    const before = copyProfileSelection(current);
    if (!before || !record(intent) || typeof intent.type !== 'string') return { state: 'invalid', reason: 'invalid-input' };
    let profiles = [...before.profiles]; let selected = [...before.selected];
    let action: Extract<ProfileChangePlan, { state: 'ready' }>['action'];
    if (intent.type === 'save') {
        if (!keys(intent, ['type', 'profile'])) return { state: 'invalid', reason: 'invalid-input' };
        const incoming = copyProfileSelection({ profiles: [intent.profile], selected: [] })?.profiles[0];
        if (!incoming) return { state: 'invalid', reason: 'invalid-input' };
        const index = profiles.findIndex(profile => profile.id === incoming.id);
        if (index < 0 && profiles.length === 10) return { state: 'invalid', reason: 'capacity' };
        if (index < 0) profiles.push(incoming); else profiles[index] = incoming;
        action = index < 0 ? 'create' : 'edit';
    } else {
        if (!['select', 'deselect', 'remove'].includes(intent.type) || !keys(intent, ['type', 'id'])
            || !localIdentifier(intent.id)) return { state: 'invalid', reason: 'invalid-input' };
        const profile = profiles.find(profile => profile.id === intent.id);
        if (!profile) return { state: 'invalid', reason: 'not-found' };
        action = intent.type as 'select' | 'deselect' | 'remove';
        if (action === 'select') {
            const sameScope = (candidate: CenterProfile) => profileScopeKey(candidate.scope) === profileScopeKey(profile.scope);
            selected = selected.filter(id => !profiles.some(candidate => candidate.id === id && sameScope(candidate)));
            selected.push(profile.id);
        } else {
            selected = selected.filter(id => id !== profile.id);
            if (action === 'remove') profiles = profiles.filter(candidate => candidate.id !== profile.id);
        }
    }
    const next = copyProfileSelection({ profiles, selected });
    if (!next) return { state: 'invalid', reason: 'conflicting-scopes' };
    const changes = profileChanges(before, next);
    return changes.length === 0 ? { state: 'unchanged' } : deepFreeze({ state: 'ready', action, next, changes });
}
