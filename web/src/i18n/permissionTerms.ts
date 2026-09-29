import type { SetupLocale } from './catalog';
import { namesEn, termsEn } from './permissionTerms/en';
import { namesEs, termsEs } from './permissionTerms/es';
import { namesFr, termsFr } from './permissionTerms/fr';
import { namesPt, termsPt } from './permissionTerms/pt';

export type PermissionTerm = 'repository' | 'organization' | 'read' | 'write'
  | 'required' | 'conditional' | 'verified' | 'missing' | 'unverifiable';
export type PermissionName = 'Metadata' | 'Contents' | 'Secrets' | 'Variables' | 'Issues'
  | 'Actions' | 'Checks' | 'Administration' | 'Workflows' | 'Issue Types'
  | 'Projects' | 'Pull requests' | 'Members';

const names = { en: namesEn, es: namesEs, fr: namesFr, pt: namesPt } as const;

/** Translates presentation labels only; GitHub permission IDs remain unchanged. */
const terms = { en: termsEn, es: termsEs, fr: termsFr, pt: termsPt } as const;

export function permissionTerm(locale: SetupLocale, term: PermissionTerm): string {
  return terms[locale][term];
}

export function permissionName(locale: SetupLocale, name: string): string {
  return Object.prototype.hasOwnProperty.call(names[locale], name) ? names[locale][name as PermissionName] : name;
}

export function permissionStatus(locale: SetupLocale, status: unknown): string | undefined {
  if (status === 'verified' || status === 'missing' || status === 'unverifiable') return terms[locale][status];
  return undefined;
}

export const permissionTermCatalogs = { names, terms };
