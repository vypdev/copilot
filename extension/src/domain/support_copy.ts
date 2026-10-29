import type { CenterLocale } from './center_copy_types.ts';
import { deepFreeze } from './value.ts';
import { en } from './support_copy_en.ts';
import { es } from './support_copy_es.ts';
import { fr } from './support_copy_fr.ts';
import { pt } from './support_copy_pt.ts';
const copies = deepFreeze({ en, es, fr, pt });
export function supportCopy(locale: CenterLocale) { return copies[locale]; }
