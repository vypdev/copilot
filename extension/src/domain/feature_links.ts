import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { FEATURE_MILESTONES, type FeatureFamily } from './feature_metadata_types.ts';
import { keys, record } from './value.ts';

/** Only two fixed repository reference kinds and registered IDs. No caller-supplied host, path, ref or URL. */
export function featureReferenceLink(value: unknown): string | null {
    if (!record(value) || !keys(value, ['kind', 'id']) || Object.keys(value).length !== 2
        || typeof value.id !== 'string' || !Object.hasOwn(FEATURE_DEFAULTS, value.id)) return null;
    const family = value.id.split('-')[1] as FeatureFamily;
    if (value.kind === 'milestone') return `https://github.com/vypdev/copilot/issues/${FEATURE_MILESTONES[family] + 701}`;
    return value.kind === 'contract' ? `https://github.com/vypdev/copilot/blob/develop/specs/browser-extension/features/${family}.v1.json` : null;
}
