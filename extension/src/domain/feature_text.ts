import type { FeatureMetadata } from './feature_metadata_types.ts';
import type { CenterLocale } from './center_copy_types.ts';
import { es } from './feature_text_es.ts';
import { fr } from './feature_text_fr.ts';
import { pt } from './feature_text_pt.ts';
import { deepFreeze } from './value.ts';

const resources = deepFreeze({ es, fr, pt });
/** Catalog text only; does not read preferences, private profile labels or native sessions. */
export function featureText(feature: FeatureMetadata, locale: CenterLocale): readonly [string, string] {
    return locale === 'en' ? Object.freeze([feature.title, feature.description] as const) : resources[locale][feature.id];
}
