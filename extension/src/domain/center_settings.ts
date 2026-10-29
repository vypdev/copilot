import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { EMPTY_PROFILES, validProfileSelection, type ProfileSelection } from './center_profiles.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';
import { validCenterBindings, type CenterBinding } from './shortcuts.ts';
import { WELCOME_STAGES, type WelcomeStage } from './welcome.ts';
export { CENTER_COMMANDS, type CenterBinding } from './shortcuts.ts';

export interface CenterSettings extends ProfileSelection {
    readonly schemaVersion: 1;
    readonly favorites: readonly string[];
    readonly bindings: readonly CenterBinding[];
    readonly appearance: { readonly text: 'standard' | 'large'; readonly motion: 'system' | 'reduced'; readonly contrast: 'system' | 'high' };
    readonly onboarding: WelcomeStage;
    readonly recents: boolean;
    readonly diagnostics: boolean;
    readonly notes: 'session' | 'local';
}
export const DEFAULT_CENTER_SETTINGS: CenterSettings = deepFreeze({ ...EMPTY_PROFILES, schemaVersion: 1,
    favorites: [], bindings: [], appearance: { text: 'standard', motion: 'system', contrast: 'system' },
    onboarding: 'welcome', recents: false, diagnostics: false, notes: 'session' });

export function validCenterSettings(value: unknown): value is CenterSettings {
    if (!record(value) || !keys(value, ['schemaVersion', 'profiles', 'selected', 'favorites', 'bindings', 'appearance',
        'onboarding', 'recents', 'diagnostics', 'notes']) || Object.keys(value).length !== 10 || value.schemaVersion !== 1
        || !jsonBytesWithin(value, 65536) || !validProfileSelection({ profiles: value.profiles, selected: value.selected })
        || !Array.isArray(value.favorites) || value.favorites.length > 20
        || ![...value.favorites].every(id => typeof id === 'string' && Object.hasOwn(FEATURE_DEFAULTS, id))
        || new Set(value.favorites).size !== value.favorites.length || !validCenterBindings(value.bindings)
        || !record(value.appearance) || !keys(value.appearance, ['text', 'motion', 'contrast'])
        || Object.keys(value.appearance).length !== 3 || !['standard', 'large'].includes(value.appearance.text as string)
        || !['system', 'reduced'].includes(value.appearance.motion as string)
        || !['system', 'high'].includes(value.appearance.contrast as string)
        || !WELCOME_STAGES.includes(value.onboarding as WelcomeStage)
        || typeof value.recents !== 'boolean' || typeof value.diagnostics !== 'boolean'
        || !['session', 'local'].includes(value.notes as string)) return false;
    return true;
}
