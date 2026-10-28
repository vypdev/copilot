import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { DEFAULT_CENTER_SETTINGS, validCenterSettings, type CenterSettings } from './center_settings.ts';
import { profileScopeKey } from './center_profiles.ts';
import type { Preferences, RepositoryPreferences } from './preferences.ts';
import { deepFreeze, keys, natural, record, jsonBytesWithin } from './value.ts';

export type { Preferences, RepositoryPreferences } from './preferences.ts';
export interface Settings extends Preferences {
    readonly schemaVersion: 2;
    readonly revision: number;
    readonly locale: 'auto' | 'en' | 'es' | 'fr' | 'pt';
    readonly theme: 'github' | 'light' | 'dark';
    readonly repositories: Readonly<Record<string, RepositoryPreferences>>;
    readonly center: CenterSettings;
}
export const DEFAULT_SETTINGS: Settings = deepFreeze({ schemaVersion: 2, revision: 0, features: {},
    density: 'comfortable', locale: 'auto', theme: 'github', shortcuts: false, paused: false, repositories: {}, center: DEFAULT_CENTER_SETTINGS });
const BASE_KEYS = ['schemaVersion', 'revision', 'features', 'density', 'locale', 'theme', 'shortcuts', 'paused', 'repositories'];
function preferences(value: Record<string, unknown>): boolean {
    if (value.features !== undefined && (!record(value.features) || !Object.entries(value.features)
        .every(([key, enabled]) => Object.hasOwn(FEATURE_DEFAULTS, key) && typeof enabled === 'boolean'))) return false;
    if (value.density !== undefined && !['comfortable', 'compact'].includes(value.density as string)) return false;
    return ['shortcuts', 'paused', 'connected'].every(key => value[key] === undefined || typeof value[key] === 'boolean');
}
function validBase(value: Record<string, unknown>): boolean {
    if (!natural(value.revision)
        || !record(value.features) || typeof value.density !== 'string' || typeof value.shortcuts !== 'boolean'
        || typeof value.paused !== 'boolean' || !preferences(value)
        || !['auto', 'en', 'es', 'fr', 'pt'].includes(value.locale as string)
        || !['github', 'light', 'dark'].includes(value.theme as string) || !record(value.repositories)
        || Object.keys(value.repositories).length > 100 || !jsonBytesWithin(value, 65536)) return false;
    return Object.entries(value.repositories).every(([id, preference]) => /^[1-9]\d{0,19}$(?![\s\S])/u.test(id)
        && record(preference) && keys(preference, ['features', 'density', 'shortcuts', 'paused', 'connected', 'savedViews'])
        && preferences(preference) && (preference.savedViews === undefined || (Array.isArray(preference.savedViews)
            && preference.savedViews.length <= 20 && preference.savedViews.every(query => typeof query === 'string'
                && query.length <= 2000 && !/[\p{Cc}]/u.test(query)))));
}
export function validSettings(value: unknown): value is Settings {
    return record(value) && keys(value, [...BASE_KEYS, 'center']) && Object.keys(value).length === 10
        && value.schemaVersion === 2 && validBase(value) && validCenterSettings(value.center);
}
export type SettingsLoad = { readonly state: 'ready'; readonly settings: Settings; readonly migrated: boolean }
    | { readonly state: 'invalid' | 'future'; readonly settings: Settings; readonly migrated: false };
export function loadSettings(value: unknown): SettingsLoad {
    if (value === undefined) return { state: 'ready', settings: DEFAULT_SETTINGS, migrated: false };
    if (record(value) && ((natural(value.schemaVersion) && value.schemaVersion > 2)
        || (value.schemaVersion === 2 && record(value.center) && natural(value.center.schemaVersion) && value.center.schemaVersion > 1))) {
        return { state: 'future', settings: DEFAULT_SETTINGS, migrated: false };
    }
    if (record(value) && value.schemaVersion === 0 && keys(value, ['schemaVersion', 'compact']) && typeof value.compact === 'boolean') {
        return { state: 'ready', settings: deepFreeze({ ...DEFAULT_SETTINGS, density: value.compact ? 'compact' : 'comfortable' }), migrated: true };
    }
    if (record(value) && value.schemaVersion === 1 && keys(value, BASE_KEYS) && Object.keys(value).length === 9 && validBase(value)) {
        const migrated = { ...value, schemaVersion: 2, center: DEFAULT_CENTER_SETTINGS };
        if (validSettings(migrated)) return { state: 'ready', settings: deepFreeze(JSON.parse(JSON.stringify(migrated)) as Settings), migrated: true };
    }
    if (!validSettings(value)) return { state: 'invalid', settings: DEFAULT_SETTINGS, migrated: false };
    return { state: 'ready', settings: deepFreeze(JSON.parse(JSON.stringify(value)) as Settings), migrated: false };
}
export function effectiveSettings(settings: Settings, repositoryId: string, tabPaused: boolean, emergency: boolean) {
    const override = settings.repositories[repositoryId];
    const paused = emergency || tabPaused || settings.paused || override?.paused === true;
    return deepFreeze({ paused, density: override?.density ?? settings.density,
        shortcuts: override?.shortcuts ?? settings.shortcuts,
        features: { ...FEATURE_DEFAULTS, ...settings.features, ...override?.features },
        connected: !paused && override?.connected === true });
}
/** Import preferences cannot grant connection or release a current pause. */
export function importedSettings(current: Settings, incoming: Settings): Settings {
    if (!current.paused && !incoming.paused && current.center.profiles.some(profile => current.center.selected.includes(profile.id)
        && profile.preferences.paused === true && !incoming.center.profiles.some(candidate => incoming.center.selected.includes(candidate.id)
            && candidate.preferences.paused === true && profileScopeKey(candidate.scope) === profileScopeKey(profile.scope)))) {
        throw new Error('settings-import-releases-profile-pause');
    }
    const ids = new Set([...Object.keys(incoming.repositories), ...Object.entries(current.repositories)
        .filter(([, preference]) => preference.paused === true).map(([id]) => id)]);
    const repositories = Object.fromEntries([...ids].map(id => [id,
        { ...incoming.repositories[id], connected: current.repositories[id]?.connected === true,
            paused: current.repositories[id]?.paused === true || incoming.repositories[id]?.paused === true }]));
    const next = { ...incoming, revision: current.revision + 1, paused: current.paused || incoming.paused, repositories };
    if (!validSettings(next)) throw new Error('settings-import-invalid-result');
    return deepFreeze(JSON.parse(JSON.stringify(next)) as Settings);
}
