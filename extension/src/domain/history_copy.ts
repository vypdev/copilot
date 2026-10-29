import { HISTORY_EN } from './history_copy_en.ts';
import { HISTORY_ES } from './history_copy_es.ts';
import { HISTORY_FR } from './history_copy_fr.ts';
import { HISTORY_PT } from './history_copy_pt.ts';
import type { HistoryCopy } from './history_copy_types.ts';
import { deepFreeze, record } from './value.ts';

const COPIES = deepFreeze({ en: HISTORY_EN, es: HISTORY_ES, fr: HISTORY_FR, pt: HISTORY_PT });
/** An incomplete bundle falls back as a whole; technical action IDs remain stable. */
export function historyCopy(locale: unknown, candidates: unknown = COPIES): HistoryCopy {
    try {
        const value = typeof locale === 'string' && ['en', 'es', 'fr', 'pt'].includes(locale) && record(candidates) ? candidates[locale] : null;
        if (!record(value)) return HISTORY_EN;
        return Object.entries(HISTORY_EN).every(([group, messages]) => {
            const translated = value[group];
            return record(translated) && Object.keys(messages).every(key => typeof translated[key] === 'string' && translated[key].trim().length > 0);
        }) ? value as unknown as HistoryCopy : HISTORY_EN;
    } catch { return HISTORY_EN; }
}
