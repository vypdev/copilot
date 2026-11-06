import type { Preferences } from './preferences.ts';
import { validProfilePreferences } from './center_profiles.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';

export type InheritedBoolean = 'inherit' | 'yes' | 'no';
export interface SessionPreferenceDraft {
    density: 'inherit' | Preferences['density']; shortcuts: InheritedBoolean; paused: InheritedBoolean;
    features: Record<string, InheritedBoolean>;
}
export function sessionPreferenceDraft(value: Partial<Preferences>): SessionPreferenceDraft {
    const boolean = (value: boolean | undefined): InheritedBoolean => value === undefined ? 'inherit' : value ? 'yes' : 'no';
    return { density: value.density ?? 'inherit', shortcuts: boolean(value.shortcuts), paused: boolean(value.paused),
        features: Object.fromEntries(Object.keys(FEATURE_DEFAULTS).sort().map(id => [id, boolean(value.features?.[id])])) };
}
export function draftSessionPreferences(value: SessionPreferenceDraft): Partial<Preferences> | null {
    if (!['inherit', 'comfortable', 'compact'].includes(value.density) || !['inherit', 'yes', 'no'].includes(value.shortcuts)
        || !['inherit', 'yes', 'no'].includes(value.paused) || Object.keys(value.features).length !== Object.keys(FEATURE_DEFAULTS).length
        || !Object.entries(value.features).every(([id, choice]) => Object.hasOwn(FEATURE_DEFAULTS, id) && ['inherit', 'yes', 'no'].includes(choice))) return null;
    const features = Object.fromEntries(Object.entries(value.features).filter(([, choice]) => choice !== 'inherit').sort(([a], [b]) => a.localeCompare(b)).map(([id, choice]) => [id, choice === 'yes']));
    const preferences = { ...(value.density === 'inherit' ? {} : { density: value.density }),
        ...(value.shortcuts === 'inherit' ? {} : { shortcuts: value.shortcuts === 'yes' }), ...(value.paused === 'inherit' ? {} : { paused: value.paused === 'yes' }),
        ...(Object.keys(features).length ? { features } : {}) };
    return validProfilePreferences(preferences) ? preferences : null;
}
