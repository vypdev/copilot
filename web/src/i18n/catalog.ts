import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { pt } from './pt';
export const setupLocales = ['en', 'es', 'fr', 'pt'] as const;
export type SetupLocale = typeof setupLocales[number];

export { en, es };

export type SetupMessageKey = keyof typeof en;
export const localeNames: Record<SetupLocale, string> = {
  en: 'English', es: 'Español', fr: 'Français', pt: 'Português',
};
export const setupCatalogs: Readonly<Record<SetupLocale, Readonly<Record<SetupMessageKey, string>>>> = {
  en, es, fr, pt,
};
export function tr(key: SetupMessageKey, language: SetupLocale, values: Record<string, string> = {}): string {
  const source = (setupCatalogs[language] ?? setupCatalogs.en)[key];
  return source.replace(/\{(\w+)\}/gu, (_, name: string) => values[name] ?? '');
}

const stageKeys: Record<string, SetupMessageKey> = {
  Repository: 'repository', 'Setup choices': 'choices', 'Setup PAT': 'setupPat',
  Plan: 'plan', 'Bot PAT & credentials': 'botPat', Apply: 'apply', Preparation: 'gettingReady',
};
export function stageLabel(stage: string | undefined, language: SetupLocale): string {
  return tr(stageKeys[stage ?? ''] ?? 'gettingReady', language);
}
