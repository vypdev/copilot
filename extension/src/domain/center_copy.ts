import { en } from './center_copy_en.ts';
import { es } from './center_copy_es.ts';
import { fr } from './center_copy_fr.ts';
import { pt } from './center_copy_pt.ts';
import { deepFreeze } from './value.ts';
import type { CenterCopy } from './center_copy_types.ts';
const resources: Readonly<Record<string, CenterCopy>> = deepFreeze({ en, es, fr, pt });
export function centerCopy(choice: unknown, nativeLanguage: unknown = 'en'): CenterCopy {
    const requested = choice === 'auto' ? nativeLanguage : choice;
    const locale = typeof requested === 'string' ? requested.toLowerCase().split('-')[0] : '';
    return Object.hasOwn(resources, locale) ? resources[locale] : resources.en;
}
