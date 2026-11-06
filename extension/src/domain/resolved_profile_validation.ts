import { exactHistoryFields as fields } from './history_decode.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { localIdentifier } from './center_routes.ts';
import type { ResolvedProfile, PreferenceSource } from './profile_resolution.ts';
import { record } from './value.ts';
import type { Preferences } from './preferences.ts';

export function resolvedPreferenceSource(value: unknown): value is PreferenceSource {
    return typeof value === 'string' && (['default', 'global', 'repository', 'session'].includes(value) || value.startsWith('profile:') && localIdentifier(value.slice(8)));
}
const features = (value: unknown, valid: (value: unknown) => boolean): boolean => record(value)
    && Object.keys(value).length === Object.keys(FEATURE_DEFAULTS).length && Object.entries(value).every(([id, value]) => Object.hasOwn(FEATURE_DEFAULTS, id) && valid(value));
/** Native preference resolution excludes emergency/tab causes, which have separate admission facts. */
export function validResolvedProfile(value: unknown): value is ResolvedProfile {
    if (!fields(value, ['density', 'shortcuts', 'paused', 'features', 'pauseSources', 'sources']) || !['comfortable', 'compact'].includes(value.density as string)
        || typeof value.shortcuts !== 'boolean' || typeof value.paused !== 'boolean' || !features(value.features, value => typeof value === 'boolean')
        || !fields(value.sources, ['density', 'shortcuts', 'paused', 'features']) || !resolvedPreferenceSource(value.sources.density)
        || !resolvedPreferenceSource(value.sources.shortcuts) || !resolvedPreferenceSource(value.sources.paused) || !features(value.sources.features, resolvedPreferenceSource)
        || !Array.isArray(value.pauseSources) || value.pauseSources.length > 8 || new Set(value.pauseSources).size !== value.pauseSources.length
        || !value.pauseSources.every(source => resolvedPreferenceSource(source) && source !== 'default')) return false;
    return value.paused === (value.pauseSources.length > 0) && value.sources.paused === (value.pauseSources.at(-1) ?? 'default');
}
/** Session attribution must correspond to an actually applicable explicit override, including every feature key. */
export function resolvedSessionMatches(value: ResolvedProfile, preferences: Partial<Preferences> = {}): boolean {
    for (const field of ['density', 'shortcuts'] as const) {
        if (preferences[field] === undefined ? value.sources[field] === 'session' : value.sources[field] !== 'session' || value[field] !== preferences[field]) return false;
    }
    return value.pauseSources.includes('session') === (preferences.paused === true)
        && Object.keys(FEATURE_DEFAULTS).every(id => preferences.features?.[id] === undefined ? value.sources.features[id] !== 'session'
            : value.sources.features[id] === 'session' && value.features[id] === preferences.features[id]);
}
