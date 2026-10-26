import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { deepFreeze, keys, natural, record, jsonBytesWithin } from './value.ts';

export interface Preferences {
    readonly features: Readonly<Record<string, boolean>>;
    readonly density: 'comfortable' | 'compact';
    readonly shortcuts: boolean;
    readonly paused: boolean;
}
export interface RepositoryPreferences extends Partial<Preferences> {
    readonly connected?: boolean;
    readonly savedViews?: readonly string[];
}
export interface Settings extends Preferences {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly locale: 'auto' | 'en' | 'es' | 'fr' | 'pt';
    readonly theme: 'github' | 'light' | 'dark';
    readonly repositories: Readonly<Record<string, RepositoryPreferences>>;
}
export const DEFAULT_SETTINGS: Settings = deepFreeze({ schemaVersion: 1, revision: 0, features: {},
    density: 'comfortable', locale: 'auto', theme: 'github', shortcuts: false, paused: false, repositories: {} });
function preferences(value: Record<string, unknown>): boolean {
    if (value.features !== undefined && (!record(value.features) || !Object.entries(value.features)
        .every(([key, enabled]) => Object.hasOwn(FEATURE_DEFAULTS, key) && typeof enabled === 'boolean'))) return false;
    if (value.density !== undefined && !['comfortable', 'compact'].includes(value.density as string)) return false;
    return ['shortcuts', 'paused', 'connected'].every(key => value[key] === undefined || typeof value[key] === 'boolean');
}
export function validSettings(value: unknown): value is Settings {
    if (!record(value) || !keys(value, ['schemaVersion', 'revision', 'features', 'density', 'locale', 'theme', 'shortcuts',
        'paused', 'repositories']) || Object.keys(value).length !== 9 || value.schemaVersion !== 1 || !natural(value.revision)
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
export type SettingsLoad = { readonly state: 'ready'; readonly settings: Settings; readonly migrated: boolean }
    | { readonly state: 'invalid' | 'future'; readonly settings: Settings; readonly migrated: false };
export function loadSettings(value: unknown): SettingsLoad {
    if (value === undefined) return { state: 'ready', settings: DEFAULT_SETTINGS, migrated: false };
    if (record(value) && natural(value.schemaVersion) && value.schemaVersion > 1) {
        return { state: 'future', settings: DEFAULT_SETTINGS, migrated: false };
    }
    if (record(value) && value.schemaVersion === 0 && keys(value, ['schemaVersion', 'compact']) && typeof value.compact === 'boolean') {
        return { state: 'ready', settings: deepFreeze({ ...DEFAULT_SETTINGS, density: value.compact ? 'compact' : 'comfortable' }), migrated: true };
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
    const repositories = Object.fromEntries(Object.entries(incoming.repositories).map(([id, value]) => [id,
        { ...value, connected: current.repositories[id]?.connected === true,
            paused: current.repositories[id]?.paused === true || value.paused === true }]));
    return deepFreeze({ ...incoming, revision: current.revision + 1, paused: current.paused || incoming.paused, repositories });
}
