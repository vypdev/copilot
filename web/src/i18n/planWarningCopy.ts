import { tr, type SetupLocale } from './catalog';
import { planWarningsEn } from './planWarnings/en';
import { planWarningsEs } from './planWarnings/es';
import { planWarningsFr } from './planWarnings/fr';
import { planWarningsPt } from './planWarnings/pt';

export const planWarningCatalogs = {
  en: planWarningsEn,
  es: planWarningsEs,
  fr: planWarningsFr,
  pt: planWarningsPt,
} as const;

export function localizedPlanWarning(warning: string, locale: SetupLocale): string {
  const catalog = planWarningCatalogs[locale] ?? planWarningsEn;
  return Object.prototype.hasOwnProperty.call(catalog, warning)
    ? catalog[warning as keyof typeof planWarningsEn]
    : locale === 'en' ? warning : tr('planUnknownWarning', locale);
}
