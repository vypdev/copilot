import { tr, type SetupLocale } from './catalog';
import { permissionTexts, type PermissionText } from './permissions/en';
import { permissionCopyEs } from './permissions/es';
import { permissionCopyFr } from './permissions/fr';
import { permissionCopyPt } from './permissions/pt';

const source = new Set<string>(permissionTexts);
export const permissionCopyCatalogs = { es: permissionCopyEs, fr: permissionCopyFr, pt: permissionCopyPt } as const;

/** Known public explanations are translated; unknown text is never exposed in another language. */
export function permissionCopy(locale: SetupLocale, text: string): string {
  if (locale === 'en') return text;
  if (!source.has(text)) return tr('permissionUnknown', locale);
  return permissionCopyCatalogs[locale][text as PermissionText];
}

export function isKnownPermissionCopy(text: string): boolean { return source.has(text); }
