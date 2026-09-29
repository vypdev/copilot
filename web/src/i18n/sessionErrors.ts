import { tr, type SetupLocale } from './catalog';
import { sessionErrorsEn } from './errors/en';
import { sessionErrorsEs } from './errors/es';
import { sessionErrorsFr } from './errors/fr';
import { sessionErrorsPt } from './errors/pt';

export const sessionErrorCatalogs = {
  en: sessionErrorsEn,
  es: sessionErrorsEs,
  fr: sessionErrorsFr,
  pt: sessionErrorsPt,
} as const;

export function localizedSessionError(raw: string, locale: SetupLocale): string {
  const catalog = sessionErrorCatalogs[locale] ?? sessionErrorsEn;
  if (Object.prototype.hasOwnProperty.call(catalog, raw)) {
    return catalog[raw as keyof typeof sessionErrorsEn];
  }
  return tr('unknownLocalError', locale);
}
