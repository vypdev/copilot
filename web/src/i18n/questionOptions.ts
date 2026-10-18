import { tr, type SetupLocale } from './catalog';
import type { SetupQuestion } from '../../../src/application/contracts/web_setup_view';
import { runnerText } from './runnerCopy';
import { optionLabelsEs } from './options/es';
import { optionLabelsFr } from './options/fr';
import { optionLabelsPt } from './options/pt';

const catalogs = { es: optionLabelsEs, fr: optionLabelsFr, pt: optionLabelsPt } as const;
const technicalValues = new Set(['codex', 'opencode', 'cursor', 'openai', 'anthropic', 'google', 'openrouter', 'local']);

/** Only visible labels change; submit the original option value. */
export function questionOptionLabel(questionId: string, option: string, locale: SetupLocale): string {
  if (questionId === 'runners.mode') return runnerText(option, locale);
  if (questionId === 'runners.validation') return runnerText(`validation-${option}`, locale);
  if (locale === 'en' || technicalValues.has(option)) return option;
  const catalog: Record<string, string> = catalogs[locale];
  if (questionId === 'issueWorkflows.enabled' && option.includes(' — ')) {
    const kind = option.split(' — ', 1)[0];
    if (catalog[kind]) return `${kind} — ${catalog[kind]}`;
  }
  if (questionId === 'repository.reconciliationCleanup' && option === 'all') {
    return { es: 'Todas las ramas temporales', fr: 'Toutes les branches temporaires', pt: 'Todos os ramos temporários' }[locale];
  }
  return catalog[option] ?? option;
}

export function isQuestionOptionLocalized(questionId: string, option: string, locale: SetupLocale): boolean {
  if (questionId.startsWith('runners.')) return true;
  if (locale === 'en' || technicalValues.has(option)) return true;
  if (questionId === 'pullRequestApproval.coverage.checkName') return true; // remote check name
  if (questionId === 'issueWorkflows.enabled' && option.includes(' — ')) {
    const kind = option.split(' — ', 1)[0];
    return Object.prototype.hasOwnProperty.call(catalogs[locale], kind);
  }
  return Object.prototype.hasOwnProperty.call(catalogs[locale], option);
}

export const optionCatalogs = catalogs;

export function suggestedQuestionAnswer(question: Omit<SetupQuestion, 'defaultValue'> & { readonly defaultValue?: SetupQuestion['defaultValue'] }, locale: SetupLocale): string {
  if (typeof question.defaultValue === 'boolean') return tr(question.defaultValue ? 'yes' : 'no', locale);
  if (question.defaultValue === undefined || question.defaultValue === '') return tr('none', locale);
  return question.kind === 'choice' || question.kind === 'multi-select'
    ? questionOptionLabel(question.id, String(question.defaultValue), locale) : String(question.defaultValue);
}
