import type { DeploymentCandidatePreflightOutcome } from '../usecases/execution/deployment_candidate_preflight_workflow';
import { deploymentCopy, resolveStaticDeploymentCatalog } from './deployment_message_catalog';

export function renderCandidatePreflightSummary(
  value: { readonly kind: 'success'; readonly outcome: DeploymentCandidatePreflightOutcome }
    | { readonly kind: 'blocked'; readonly code: string; readonly reason: string },
  locale: string,
  repositoryFullName: string,
): string {
  const messages = deploymentCopy(resolveStaticDeploymentCatalog(locale));
  const lines = [`## ${messages.jobSummary}`, ''];
  if (value.kind === 'blocked') {
    lines.push(`> **${messages.replacementBlockedNotice}**`, '',
      `**${messages.actionRequired}:** ${messages.replacementPreflightAction}`, '', '<details>',
      `<summary>${messages.technical}</summary>`, '',
      `- ${messages.reason}: ${inline(value.reason)}`, `- Error: ${inline(value.code)}`, '</details>');
    return lines.join('\n');
  }
  const outcome = value.outcome;
  const notice = outcome.mode === 'prepare' ? messages.replacementPrepareNotice
    : outcome.mode === 'recover' ? messages.replacementRecoverNotice : messages.replacementRecordedNotice;
  const repository = repositoryFullName.split('/').map(encodeURIComponent).join('/');
  const root = `https://github.com/${repository}`;
  lines.push(`> **${messages.currentStatus}:** ${notice}`, '',
    `[${messages.controlCenter}](${root}/issues/${outcome.issue}) · [${messages.previousCandidate}](${root}/pull/${outcome.previousPromotion}) · [${messages.preparedSource}](${root}/commit/${outcome.candidateSha})`, '',
    '<details>', `<summary>${messages.technical}</summary>`, '',
    `- ${messages.operation}: ${inline(outcome.currentOperationId)} (revision ${outcome.currentRevision})`,
    `- ${messages.sourceSha}: ${inline(outcome.candidateSha)}`,
    `- ${messages.productionSha}: ${inline(outcome.productionBaseSha)}`, '</details>');
  return lines.join('\n');
}
function inline(value: string): string {
  return '`' + value.replace(/[\r\n]/g, ' ').replace(/`/g, "'").replace(/@/g, '@\u200b').replace(/<!--/g, '&lt;!--').replace(/-->/g, '--&gt;').slice(0, 256) + '`';
}
