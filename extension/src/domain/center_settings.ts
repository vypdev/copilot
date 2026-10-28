import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { EMPTY_PROFILES, validProfileSelection, type ProfileSelection } from './center_profiles.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export const CENTER_COMMANDS = Object.freeze(['open-center', 'open-features', 'open-profiles', 'open-help'] as const);
export interface CenterBinding { readonly command: typeof CENTER_COMMANDS[number]; readonly binding: string }
export interface CenterSettings extends ProfileSelection {
    readonly schemaVersion: 1;
    readonly favorites: readonly string[];
    readonly bindings: readonly CenterBinding[];
    readonly appearance: { readonly text: 'standard' | 'large'; readonly motion: 'system' | 'reduced'; readonly contrast: 'system' | 'high' };
    readonly onboarding: 'welcome' | 'profile' | 'permissions' | 'complete';
    readonly recents: boolean;
    readonly diagnostics: boolean;
    readonly notes: 'session' | 'local';
}
export const DEFAULT_CENTER_SETTINGS: CenterSettings = deepFreeze({ ...EMPTY_PROFILES, schemaVersion: 1,
    favorites: [], bindings: [], appearance: { text: 'standard', motion: 'system', contrast: 'system' },
    onboarding: 'welcome', recents: false, diagnostics: false, notes: 'session' });

/** Configuring a chord is not proof of runtime eligibility or absence of a native/OS conflict. */
function validBindings(value: unknown): value is readonly CenterBinding[] {
    if (!Array.isArray(value) || value.length > 4) return false;
    const commands = new Set<string>(); const chords = new Set<string>();
    for (const binding of value) {
        if (!record(binding) || !keys(binding, ['command', 'binding']) || typeof binding.command !== 'string'
            || !CENTER_COMMANDS.includes(binding.command as typeof CENTER_COMMANDS[number])
            || typeof binding.binding !== 'string' || !/^Alt\+Shift\+[A-Z]$(?![\s\S])/u.test(binding.binding)
            || commands.has(binding.command) || chords.has(binding.binding)) return false;
        commands.add(binding.command); chords.add(binding.binding);
    }
    return true;
}

export function validCenterSettings(value: unknown): value is CenterSettings {
    if (!record(value) || !keys(value, ['schemaVersion', 'profiles', 'selected', 'favorites', 'bindings', 'appearance',
        'onboarding', 'recents', 'diagnostics', 'notes']) || Object.keys(value).length !== 10 || value.schemaVersion !== 1
        || !jsonBytesWithin(value, 65536) || !validProfileSelection({ profiles: value.profiles, selected: value.selected })
        || !Array.isArray(value.favorites) || value.favorites.length > 20
        || ![...value.favorites].every(id => typeof id === 'string' && Object.hasOwn(FEATURE_DEFAULTS, id))
        || new Set(value.favorites).size !== value.favorites.length || !validBindings(value.bindings)
        || !record(value.appearance) || !keys(value.appearance, ['text', 'motion', 'contrast'])
        || Object.keys(value.appearance).length !== 3 || !['standard', 'large'].includes(value.appearance.text as string)
        || !['system', 'reduced'].includes(value.appearance.motion as string)
        || !['system', 'high'].includes(value.appearance.contrast as string)
        || !['welcome', 'profile', 'permissions', 'complete'].includes(value.onboarding as string)
        || typeof value.recents !== 'boolean' || typeof value.diagnostics !== 'boolean'
        || !['session', 'local'].includes(value.notes as string)) return false;
    return true;
}
