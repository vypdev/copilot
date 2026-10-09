import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
import type { SetupLocale } from './catalog';
import { promptCopyEn, type PromptCopy } from './prompts/en';
import { promptCopyEs } from './prompts/es';
import { promptCopyFr } from './prompts/fr';
import { promptCopyPt } from './prompts/pt';
import { messageCopyCatalogs } from './messageCopy';

export const promptCopyCatalogs: Readonly<Record<SetupLocale, typeof promptCopyEn>> = {
  en: promptCopyEn, es: promptCopyEs, fr: promptCopyFr, pt: promptCopyPt,
};

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-zA-Z]\w*)\}/gu, (_, key: string) => values[key] ?? '');
}

export function localizedPromptCopy(prompt: WebSetupPrompt, locale: SetupLocale): PromptCopy | undefined {
  if (!prompt.copyId) return undefined;
  const copy = promptCopyCatalogs[locale][prompt.copyId];
  const values = { ...(prompt.copyValues ?? {}) };
  if (prompt.copyId === 'credential.existing' && values.status &&
    ['valid', 'invalid', 'missing', 'unverifiable', 'not_required'].includes(values.status)) {
    const statusId = `credential.status.${values.status}` as keyof typeof messageCopyCatalogs.en;
    values.status = messageCopyCatalogs[locale][statusId];
  }
  return {
    title: interpolate(copy.title, values),
    description: interpolate(copy.description, values),
    ...(copy.choices ? { choices: copy.choices } : {}),
  };
}

export function localizedPromptChoice(prompt: Extract<WebSetupPrompt, { kind: 'choice' | 'confirm' }>, locale: SetupLocale, index: number): string {
  return localizedPromptCopy(prompt, locale)?.choices?.[index] ?? prompt.choices[index];
}
