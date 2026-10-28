import { DEFAULT_SETTINGS, importedSettings, loadSettings, validSettings, type Settings } from './settings.ts';
import { DEFAULT_CENTER_SETTINGS } from './center_settings.ts';
import { numericIdentity } from './center_profiles.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { planProfileChange } from './profile_change.ts';
import { sameSettingsContent } from './settings_operation.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export type SettingsAction = `profile-${'create' | 'edit' | 'select' | 'deselect' | 'remove'}`
    | 'preferences' | 'center-preferences' | 'repository-preferences' | 'import' | 'rollback'
    | `reset-${'global' | 'profiles' | 'appearance' | 'repository' | 'all'}`;
export type SettingsChangePlan = { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'profile-invalid'
    | 'profile-capacity' | 'profile-not-found' | 'profile-conflict' | 'future-schema' | 'pause-protected' | 'no-rollback' }
    | { readonly state: 'unchanged' }
    | { readonly state: 'ready'; readonly action: SettingsAction; readonly settings: Settings };
export const MAX_CENTER_REQUEST_BYTES = 68 * 1024;

function featurePatch(before: Readonly<Record<string, boolean>>, value: unknown): Record<string, boolean> | null {
    if (!record(value) || !Object.entries(value).every(([id, enabled]) => Object.hasOwn(FEATURE_DEFAULTS, id)
        && (typeof enabled === 'boolean' || enabled === null))) return null;
    const features = { ...before };
    for (const [id, enabled] of Object.entries(value)) {
        if (enabled === null) delete features[id]; else features[id] = enabled as boolean;
    }
    return features;
}
function complete(current: Settings, settings: unknown, action: SettingsAction): SettingsChangePlan {
    if (!validSettings(settings)) return { state: 'invalid', reason: 'invalid-input' };
    return sameSettingsContent(current, settings) ? { state: 'unchanged' }
        : deepFreeze({ state: 'ready', action, settings: JSON.parse(JSON.stringify(settings)) as Settings });
}
function keepConnections(current: Settings, incoming: Settings): Settings['repositories'] {
    return Object.fromEntries(Object.entries(incoming.repositories).map(([id, preference]) =>
        [id, { ...preference, connected: current.repositories[id]?.connected === true }]));
}

/** Closed preference intents only. No credential, grant, arbitrary URL, command or repository write. */
export function planSettingsChange(current: Settings, intent: unknown, rollback: Settings | null = null): SettingsChangePlan {
    if (!validSettings(current) || !record(intent) || !jsonBytesWithin(intent, MAX_CENTER_REQUEST_BYTES)) return { state: 'invalid', reason: 'invalid-input' };
    if (intent.type === 'profile' && keys(intent, ['type', 'change'])) {
        const plan = planProfileChange({ profiles: current.center.profiles, selected: current.center.selected }, intent.change);
        if (plan.state === 'invalid') return { state: 'invalid', reason: ({ 'invalid-input': 'profile-invalid',
            'capacity': 'profile-capacity', 'not-found': 'profile-not-found', 'conflicting-scopes': 'profile-conflict' } as const)[plan.reason] };
        if (plan.state === 'unchanged') return plan;
        return complete(current, { ...current, center: { ...current.center, ...plan.next } }, `profile-${plan.action}`);
    }
    if (intent.type === 'preferences' && keys(intent, ['type', 'values']) && record(intent.values)
        && keys(intent.values, ['features', 'locale', 'theme', 'density', 'shortcuts', 'paused'])) {
        const features = Object.hasOwn(intent.values, 'features') ? featurePatch(current.features, intent.values.features) : current.features;
        return features === null ? { state: 'invalid', reason: 'invalid-input' }
            : complete(current, { ...current, ...intent.values, features }, 'preferences');
    }
    if (intent.type === 'center' && keys(intent, ['type', 'values']) && record(intent.values)
        && keys(intent.values, ['favorites', 'bindings', 'appearance', 'onboarding', 'recents', 'diagnostics', 'notes'])) {
        return complete(current, { ...current, center: { ...current.center, ...intent.values } }, 'center-preferences');
    }
    if (intent.type === 'repository' && keys(intent, ['type', 'repositoryId', 'preferences']) && numericIdentity(intent.repositoryId)
        && record(intent.preferences) && keys(intent.preferences, ['features', 'density', 'shortcuts', 'paused', 'savedViews'])) {
        const previous = current.repositories[intent.repositoryId];
        const preference = { ...previous, ...intent.preferences };
        if (Object.hasOwn(intent.preferences, 'features')) {
            const features = featurePatch(previous?.features ?? {}, intent.preferences.features);
            if (features === null) return { state: 'invalid', reason: 'invalid-input' };
            preference.features = features;
        }
        if (!previous && Object.keys(preference).length === 0) return { state: 'unchanged' };
        return complete(current, { ...current, repositories: { ...current.repositories, [intent.repositoryId]: preference } }, 'repository-preferences');
    }
    if (intent.type === 'import' && keys(intent, ['type', 'settings']) && intent.settings !== undefined) {
        const incoming = loadSettings(intent.settings);
        if (incoming.state !== 'ready') return { state: 'invalid', reason: incoming.state === 'future' ? 'future-schema' : 'invalid-input' };
        try {
            return complete(current, { ...importedSettings(current, incoming.settings), revision: current.revision }, 'import');
        } catch (error) {
            return { state: 'invalid', reason: error instanceof Error && error.message === 'settings-import-releases-profile-pause'
                ? 'pause-protected' : 'invalid-input' };
        }
    }
    if (intent.type === 'rollback' && keys(intent, ['type'])) {
        if (!rollback || !validSettings(rollback)) return { state: 'invalid', reason: 'no-rollback' };
        return complete(current, { ...rollback, revision: current.revision, repositories: keepConnections(current, rollback) }, 'rollback');
    }
    if (intent.type === 'reset' && keys(intent, ['type', 'scope', 'repositoryId'])) {
        if (intent.scope === 'repository' && numericIdentity(intent.repositoryId)) {
            const repositories = { ...current.repositories };
            if (repositories[intent.repositoryId]?.connected === true) repositories[intent.repositoryId] = { connected: true };
            else delete repositories[intent.repositoryId];
            return complete(current, { ...current, repositories }, 'reset-repository');
        }
        if (intent.repositoryId !== undefined) return { state: 'invalid', reason: 'invalid-input' };
        if (intent.scope === 'global') return complete(current, { ...DEFAULT_SETTINGS, revision: current.revision,
            repositories: current.repositories, center: current.center }, 'reset-global');
        if (intent.scope === 'profiles') return complete(current, { ...current, center: { ...current.center, profiles: [], selected: [] } }, 'reset-profiles');
        if (intent.scope === 'appearance') return complete(current, { ...current, theme: DEFAULT_SETTINGS.theme, density: DEFAULT_SETTINGS.density,
            center: { ...current.center, appearance: DEFAULT_CENTER_SETTINGS.appearance } }, 'reset-appearance');
        if (intent.scope === 'all') return complete(current, { ...DEFAULT_SETTINGS, revision: current.revision,
            repositories: Object.fromEntries(Object.entries(current.repositories).filter(([, preference]) => preference.connected === true)
                .map(([id]) => [id, { connected: true }])) }, 'reset-all');
    }
    return { state: 'invalid', reason: 'invalid-input' };
}
