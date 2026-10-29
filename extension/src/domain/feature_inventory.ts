import { FEATURE_METADATA } from './feature_metadata.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import type { FeatureMetadata, FeatureSurface } from './feature_metadata_types.ts';
import { FEATURE_MILESTONES } from './feature_metadata_types.ts';
import type { CenterRoute } from './center_routes.ts';
import type { CenterLocale } from './center_copy_types.ts';
import type { ConnectionOutcome } from './named_sessions.ts';
import type { Settings } from './settings.ts';
import type { PreferenceSource } from './profile_resolution.ts';
import { centerProfileResolution, sourceProfileName } from './profile_context.ts';
import type { InventoryCopy } from './inventory_copy.ts';
import { es } from './feature_text_es.ts';
import { fr } from './feature_text_fr.ts';
import { pt } from './feature_text_pt.ts';
import { deepFreeze } from './value.ts';
import type { InventoryFilters } from './inventory_filters.ts';

const resources = deepFreeze({ es, fr, pt });
const routes: Readonly<Record<string, CenterRoute>> = Object.freeze({ 'BEX-CENTER-01': 'overview', 'BEX-CENTER-02': 'features', 'BEX-CENTER-03': 'profiles',
    'BEX-CENTER-04': 'repositories', 'BEX-CENTER-05': 'connections', 'BEX-CENTER-06': 'privacy', 'BEX-CENTER-07': 'shortcuts', 'BEX-CENTER-08': 'data',
    'BEX-CENTER-11': 'appearance', 'BEX-CENTER-12': 'language', 'BEX-CENTER-13': 'welcome', 'BEX-CENTER-14': 'data' });
export type InventorySource = keyof InventoryCopy['sources'];
export interface InventoryFeature extends FeatureMetadata {
    readonly favorite: boolean | null; readonly enabled: boolean | null; readonly defaultEnabled: boolean; readonly paused: boolean | null; readonly source: InventorySource;
    readonly profileName: string | null; readonly profileId: string | null; readonly milestone: number; readonly issue: number;
    readonly phase: 'current' | 'later'; readonly tools: CenterRoute | null;
}
export function inventorySource(source: PreferenceSource): InventorySource { return source.startsWith('profile:') ? 'profile' : source as InventorySource; }
export function featureInventory(settings: Settings | null, connections: ConnectionOutcome | null | undefined, locale: CenterLocale): readonly InventoryFeature[] {
    const known = settings === null ? null : { settings, state: centerProfileResolution(settings, connections) };
    return deepFreeze(FEATURE_METADATA.map(feature => {
        const text = locale === 'en' ? [feature.title, feature.description] : resources[locale][feature.id];
        const milestone = FEATURE_MILESTONES[feature.family];
        const metadata = { ...feature, title: text[0], description: text[1], defaultEnabled: FEATURE_DEFAULTS[feature.id], milestone, issue: milestone + 701,
            phase: milestone === 3 ? 'current' as const : 'later' as const, tools: routes[feature.id] ?? null };
        if (known === null) return { ...metadata, favorite: null, enabled: null, paused: null, source: 'unknown' as const, profileId: null, profileName: null };
        const source = known.state.preferences.sources.features[feature.id];
        const profileId = source.startsWith('profile:') ? source.slice('profile:'.length) : null;
        return { ...metadata, favorite: known.settings.center.favorites.includes(feature.id), enabled: known.state.preferences.features[feature.id],
            paused: known.state.preferences.paused, source: inventorySource(source), profileName: sourceProfileName(source, known.settings), profileId };
    }));
}
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
export function filterInventory(features: readonly InventoryFeature[], filters: InventoryFilters, copy: InventoryCopy): readonly InventoryFeature[] {
    const words = normalized(filters.query.slice(0, 200)).trim().split(/\s+/u).filter(Boolean);
    return features.filter(feature => (!filters.family || feature.family === filters.family) && (!filters.surface || feature.surfaces.includes(filters.surface as FeatureSurface))
        && (!filters.mode || feature.mode === filters.mode) && (!filters.permission || feature.permission === filters.permission)
        && (!filters.phase || feature.phase === filters.phase) && (!filters.source || feature.source === filters.source)
        && (!filters.profile || feature.profileId === filters.profile)
        && (!filters.setting || filters.setting === (feature.enabled === null ? 'unknown' : feature.paused ? 'paused' : feature.enabled ? 'enabled' : 'disabled'))
        && (!filters.favorites || feature.favorite) && words.every(word => normalized([feature.id, feature.title, feature.description,
            copy.families[feature.family], ...feature.surfaces.map(surface => copy.surfaces[surface]), copy.modes[feature.mode], copy.permissions[feature.permission],
            copy.sources[feature.source], feature.profileName ?? ''].join(' ')).includes(word)));
}
export function inventoryPage(features: readonly InventoryFeature[], page: number) {
    const pages = Math.max(1, Math.ceil(features.length / 25)); const current = Number.isFinite(page) ? Math.min(pages, Math.max(1, Math.floor(page))) : 1;
    const start = (current - 1) * 25;
    return { current, pages, start: features.length ? start + 1 : 0, end: Math.min(start + 25, features.length), features: features.slice(start, start + 25) };
}
export function featurePreferenceIntent(id: string, choice: string): unknown | null {
    return Object.hasOwn(FEATURE_DEFAULTS, id) && ['inherit', 'enabled', 'disabled'].includes(choice)
        ? { type: 'preferences', values: { features: { [id]: choice === 'inherit' ? null : choice === 'enabled' } } } : null;
}
export function featureFavoriteIntent(settings: Settings, id: string): unknown | null {
    if (!Object.hasOwn(FEATURE_DEFAULTS, id)) return null;
    const favorites = settings.center.favorites.includes(id) ? settings.center.favorites.filter(value => value !== id) : [...settings.center.favorites, id];
    return favorites.length <= 20 ? { type: 'center', values: { favorites } } : null;
}
export function inventoryResultText(count: number, start: number, end: number, copy: InventoryCopy): string {
    return copy.results.replace('{count}', String(count)).replace('{start}', String(start)).replace('{end}', String(end));
}
