import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
import { tr, type SetupLocale } from './catalog';
import { messageCopyEn } from './messages/en';
import { messageCopyEs } from './messages/es';
import { messageCopyFr } from './messages/fr';
import { messageCopyPt } from './messages/pt';
import { questionOptionLabel } from './questionOptions';
import { managementCopy } from './managementCopy';

export const messageCopyCatalogs: Readonly<Record<SetupLocale, typeof messageCopyEn>> = {
  en: messageCopyEn, es: messageCopyEs, fr: messageCopyFr, pt: messageCopyPt,
};

export function localizedMessage(message: NonNullable<WebSetupView['message']>, locale: SetupLocale): string {
  if (message.managementState) return managementCopy(locale)[message.managementState];
  if (!message.copyId) return locale === 'en' ? message.text : tr('unknownLocalError', locale);
  const template = messageCopyCatalogs[locale][message.copyId];
  const values = message.copyValues ?? {};
  const localizedValues = message.copyId === 'permission.preview'
    ? {
        ...values,
        issues: (values.issues ?? '').split('|').map(value => questionOptionLabel('issueWorkflows.enabled', value, locale)).join(', '),
        approval: questionOptionLabel('pullRequestApproval.mode', values.approval ?? '', locale),
        secrets: questionOptionLabel('storage.secrets.defaultScope', values.secrets ?? '', locale),
        variables: questionOptionLabel('storage.variables.defaultScope', values.variables ?? '', locale),
        projects: questionOptionLabel('projects.ids', values.projects ?? '', locale),
      }
    : values;
  const summary = template.replace(/\{([a-zA-Z]\w*)\}/gu, (_, key: string) => localizedValues[key] ?? '');
  if (message.copyId !== 'credential.checks' || !message.credentialChecks?.length) return summary;
  const checks = message.credentialChecks.map(check => {
    const statusId = `credential.status.${check.status}` as const;
    return `${check.name}: ${messageCopyCatalogs[locale][statusId]}`;
  });
  return `${summary}\n${checks.join('\n')}`;
}
