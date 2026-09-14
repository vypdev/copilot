import type {
  BugbotProjectedFinding,
  BugbotReviewProjection,
} from '../../domain/bugbot/review_projection';
import {
  isBugbotActionableState,
  type BugbotFindingState,
} from '../../domain/bugbot/review_state';
import { sanitizeAgentMarkdown } from './github_comment_publication_policy';
import type { BugbotReviewNavigation } from '../ports/bugbot_review_navigation_ports';
import { buildPublicationMarker } from './publication_identity_policy';

export const BUGBOT_STATUS_MARKER_PREFIX = 'copilot-bugbot-status';
export const BUGBOT_REVIEW_MARKER_PREFIX = 'copilot-bugbot-review';
export const BUGBOT_REVIEW_STATUS_START = '<!-- copilot-bugbot-review-status:start';
export const BUGBOT_REVIEW_STATUS_END = '<!-- copilot-bugbot-review-status:end -->';

type SupportedLocale = 'en-US' | 'es-ES';

export type BugbotPresentationLinks = BugbotReviewNavigation;

export function normalizeBugbotPresentationLocale(locale: string): SupportedLocale {
  return locale.trim().toLowerCase() === 'es-es' ? 'es-ES' : 'en-US';
}

export function buildBugbotStatusMarker(projection: BugbotReviewProjection): string {
  return `<!-- ${BUGBOT_STATUS_MARKER_PREFIX} schema="1" pr="${projection.pullRequestNumber}" verified_head="${projection.verifiedHeadSha}" digest="${projection.digest}" -->`;
}

export function isBugbotStatusComment(body: string | null): boolean {
  if (!body) return false;
  return new RegExp(
    `<!--\\s*${BUGBOT_STATUS_MARKER_PREFIX}\\s+schema="1"\\s+pr="\\d+"\\s+verified_head="[a-fA-F0-9]{7,64}"\\s+digest="[a-f0-9]{8}"\\s*-->`,
    'u',
  ).test(body);
}

export function renderBugbotStatusCard(
  projection: BugbotReviewProjection,
  locale: string,
  links: BugbotPresentationLinks,
): string {
  const language = normalizeBugbotPresentationLocale(locale);
  const actionable = projection.findings.filter((finding) =>
    isBugbotActionableState(finding.state),
  );
  const unknown = projection.counts.unknown;
  const partialCoverage = projection.coverage.status === 'partial';
  const shortHead = projection.verifiedHeadSha.slice(0, 7);
  const heading = partialCoverage
    ? language === 'es-ES' ? '## Bugbot: revisión incompleta' : '## Bugbot: review incomplete'
    : projection.outcome === 'partial' || projection.outcome === 'failed' || unknown > 0
      ? language === 'es-ES' ? '## Bugbot: la revisión necesita verificación' : '## Bugbot: review needs verification'
      : actionable.length === 0
        ? language === 'es-ES' ? '## Bugbot: revisión completada' : '## Bugbot: review complete'
        : language === 'es-ES'
          ? `## Bugbot: ${actionable.length} hallazgo(s) requieren atención`
          : `## Bugbot: ${actionable.length} finding(s) need attention`;
  const status = partialCoverage
    ? language === 'es-ES'
      ? `La revisión de \`${shortHead}\` tiene cobertura parcial; no puede declarar limpio el pull request completo.`
      : `The review of \`${shortHead}\` has partial coverage and cannot declare the whole pull request clean.`
    : unknown > 0
    ? language === 'es-ES'
      ? `${unknown} hallazgo(s) tienen un estado desconocido en \`${shortHead}\`.`
      : `${unknown} finding(s) have unknown state on \`${shortHead}\`.`
    : projection.outcome === 'partial' || projection.outcome === 'failed'
      ? language === 'es-ES'
        ? `Bugbot no pudo sincronizar por completo el estado de \`${shortHead}\`.`
        : `Bugbot could not fully synchronize the state of \`${shortHead}\`.`
      : actionable.length === 0
        ? language === 'es-ES'
          ? `No hay hallazgos activos en \`${shortHead}\`.`
          : `No active findings on \`${shortHead}\`.`
        : language === 'es-ES'
          ? `${actionable.length} hallazgo(s) requieren atención en \`${shortHead}\`.`
          : `${actionable.length} finding(s) require attention on \`${shortHead}\`.`;
  const action = partialCoverage
    ? language === 'es-ES'
      ? 'Revisa los elementos omitidos o reduce el alcance del PR. Repite la revisión solo después de cambiar el alcance, los límites o el acceso.'
      : 'Inspect the omitted items or reduce the PR scope. Rerun the review only after changing the scope, limits, or access.'
    : projection.outcome === 'partial' || projection.outcome === 'failed' || unknown > 0
    ? language === 'es-ES'
      ? 'Corrige la causa indicada y ejecuta `/copilot recheck` una vez.'
      : 'Correct the reported cause, then run `/copilot recheck` once.'
    : actionable.length > 0
      ? language === 'es-ES'
        ? 'Revisa los threads enlazados o comenta `/copilot fix all`.'
        : 'Review the linked threads or comment `/copilot fix all`.'
      : undefined;
  const findingsHeading = language === 'es-ES' ? '### Hallazgos' : '### Findings';
  const visibleFindings = projection.findings.filter((finding) =>
    isBugbotActionableState(finding.state) || finding.state === 'unknown',
  );
  const findingRows = visibleFindings.slice(0, 20).map((finding) => renderFindingRow(finding));
  if (visibleFindings.length > 20) {
    findingRows.push(
      language === 'es-ES'
        ? `- …y ${visibleFindings.length - 20} más.`
        : `- …and ${visibleFindings.length - 20} more.`,
    );
  }
  const navigation = [
    `[Pull request](${links.pullRequestUrl})`,
    `[${language === 'es-ES' ? 'Commit verificado' : 'Verified commit'}](${links.commitUrl})`,
    ...(links.runUrl
      ? [`[${language === 'es-ES' ? 'Ejecución' : 'Workflow run'}](${links.runUrl})`]
      : []),
  ].join(' · ');
  const coverageRows = projection.coverage.sources.map((source) => {
    const omitted = source.omittedItems > 0 ? `, omitted=${source.omittedItems}` : '';
    const truncated = source.truncatedItems > 0 ? `, truncated=${source.truncatedItems}` : '';
    const capped = source.providerLimitReached ? ', provider page limit reached; additional older records are uncounted' : '';
    return `- ${source.source}: ${source.status}; retained=${source.itemsRetained}${omitted}${truncated}${capped}`;
  });
  const lines = [
    buildPublicationMarker({
      identity: { topic: 'bugbot', target: { kind: 'pull-request', number: projection.pullRequestNumber }, key: 'aggregate' },
      sourceVersion: `head:${projection.verifiedHeadSha}`,
      digest: projection.digest,
    }),
    buildBugbotStatusMarker(projection),
    heading,
    '',
    `> **${language === 'es-ES' ? 'Estado actual' : 'Current status'}:** ${status}`,
  ];
  if (action) lines.push('>', `> **${language === 'es-ES' ? 'Acción' : 'Action'}:** ${action}`);
  if (findingRows.length > 0) lines.push('', findingsHeading, '', ...findingRows);
  if (partialCoverage) {
    lines.push(
      '',
      '<details>',
      `<summary>${language === 'es-ES' ? 'Cobertura incompleta' : 'Incomplete coverage'}</summary>`,
      '',
      ...coverageRows,
      '',
      '</details>',
    );
  }
  if (projection.errors.length > 0) {
    lines.push(
      '',
      '<details>',
      `<summary>${language === 'es-ES' ? 'Recuperación' : 'Recovery details'}</summary>`,
      '',
      ...projection.errors.slice(0, 10).map((error) => `- ${sanitizeAgentMarkdown(error, 500)}`),
      '',
      '</details>',
    );
  }
  lines.push('', navigation);
  return lines.join('\n');
}

export function renderBugbotReviewSnapshot(
  originalBody: string | null,
  input: {
    readonly reviewIdentity: string;
    readonly analyzedHeadSha: string;
    readonly currentHeadSha: string;
    readonly projectionDigest: string;
    readonly coverageStatus: 'complete' | 'partial';
    readonly findings: readonly BugbotProjectedFinding[];
    readonly locale: string;
    readonly statusUrl: string;
  },
): string {
  const language = normalizeBugbotPresentationLocale(input.locale);
  const hasUntrackedOverflow = /### Additional findings omitted by the comment limit/u.test(
    originalBody ?? '',
  );
  const normalized = normalizeHistoricalSnapshot(originalBody ?? '', input.analyzedHeadSha, language);
  const actionable = input.findings.filter((finding) => isBugbotActionableState(finding.state)).length;
  const unknown = input.findings.filter((finding) => finding.state === 'unknown').length;
  const status = input.coverageStatus === 'partial'
    ? language === 'es-ES'
      ? 'La cobertura global es parcial; este snapshot no demuestra que todos sus hallazgos estén resueltos.'
      : 'Overall coverage is partial; this snapshot does not prove that all of its findings are resolved.'
    : unknown > 0
    ? language === 'es-ES'
      ? `No se pudo verificar el estado de ${unknown} hallazgo(s) de este review.`
      : `The state of ${unknown} finding(s) from this review could not be verified.`
    : actionable === 0 && hasUntrackedOverflow
      ? language === 'es-ES'
        ? 'Ningún hallazgo con seguimiento individual de este review requiere atención. El snapshot también contiene overflow histórico sin thread individual; consulta el estado agregado.'
        : 'No individually tracked finding from this review requires attention. The snapshot also contains historical overflow without individual threads; see the aggregate status.'
      : actionable === 0
      ? language === 'es-ES'
        ? 'Todos los hallazgos originados en este review están resueltos.'
        : 'All findings originating in this review are resolved.'
      : hasUntrackedOverflow
        ? language === 'es-ES'
          ? `${actionable} hallazgo(s) con seguimiento individual de este review requieren atención. El snapshot también contiene overflow histórico sin thread individual.`
          : `${actionable} individually tracked finding(s) from this review require attention. The snapshot also contains historical overflow without individual threads.`
      : language === 'es-ES'
        ? `${actionable} hallazgo(s) originados en este review requieren atención.`
        : `${actionable} finding(s) originating in this review require attention.`;
  const linkLabel = language === 'es-ES' ? 'Ver estado agregado de Bugbot' : 'See aggregate Bugbot status';
  return [
    `<!-- ${BUGBOT_REVIEW_MARKER_PREFIX} schema="1" review="${input.reviewIdentity}" analyzed_head="${input.analyzedHeadSha}" -->`,
    `${BUGBOT_REVIEW_STATUS_START} digest="${input.projectionDigest}" -->`,
    `> **${language === 'es-ES' ? 'Estado actual' : 'Current status'}:** ${status}`,
    `> ${language === 'es-ES' ? 'Última reconciliación en' : 'Last reconciled on'} \`${input.currentHeadSha.slice(0, 7)}\`. [${linkLabel}](${input.statusUrl}).`,
    BUGBOT_REVIEW_STATUS_END,
    '',
    normalized,
  ].join('\n');
}

export function buildNewBugbotReviewSnapshotHeader(
  analyzedHeadSha: string,
  findingCount: number,
  inlineCount: number,
  locale: string,
): string {
  const language = normalizeBugbotPresentationLocale(locale);
  return [
    `<!-- ${BUGBOT_REVIEW_MARKER_PREFIX} schema="1" analyzed_head="${analyzedHeadSha}" -->`,
    `${BUGBOT_REVIEW_STATUS_START} digest="pending" -->`,
    `> **${language === 'es-ES' ? 'Estado actual' : 'Current status'}:** ${findingCount} ${language === 'es-ES' ? 'hallazgo(s) requieren atención' : 'finding(s) require attention'}.`,
    BUGBOT_REVIEW_STATUS_END,
    '',
    language === 'es-ES' ? '## 🤖 Snapshot del review de Bugbot' : '## 🤖 Bugbot review snapshot',
    language === 'es-ES'
      ? `Bugbot reportó **${findingCount}** problema(s) potencial(es) cuando se analizó el commit \`${analyzedHeadSha.slice(0, 7)}\`. Este snapshot es histórico; usa el bloque de estado superior para conocer el estado actual. ${inlineCount} hallazgo(s) están enlazados al código modificado.`
      : `Bugbot reported **${findingCount}** potential problem(s) when commit \`${analyzedHeadSha.slice(0, 7)}\` was analyzed. This snapshot is historical; use the status block above for current state. ${inlineCount} finding(s) are linked to changed code.`,
  ].join('\n');
}

function normalizeHistoricalSnapshot(
  originalBody: string,
  analyzedHeadSha: string,
  locale: SupportedLocale,
): string {
  let body = originalBody
    .replace(new RegExp(`<!--\\s*${BUGBOT_REVIEW_MARKER_PREFIX}\\s+schema="1"[^>]*-->\\s*`, 'gu'), '')
    .replace(new RegExp(`${escapeRegExp(BUGBOT_REVIEW_STATUS_START)}[\\s\\S]*?${escapeRegExp(BUGBOT_REVIEW_STATUS_END)}\\s*`, 'gu'), '')
    .trim();
  if (!/^## 🤖 (?:Bugbot review snapshot|Snapshot del review de Bugbot)$/mu.test(body)) {
    const heading = locale === 'es-ES' ? '## 🤖 Snapshot del review de Bugbot' : '## 🤖 Bugbot review snapshot';
    body = `${heading}\n\n${body}`;
  }
  return body;
}

function renderFindingRow(finding: BugbotProjectedFinding): string {
  const label = sanitizeAgentMarkdown(finding.title || finding.id, 500).replace(/[\r\n]+/gu, ' ');
  const state = stateLabel(finding.state);
  return finding.url
    ? `- ${state} — [${label}](${finding.url})`
    : `- ${state} — ${label}`;
}

function stateLabel(state: BugbotFindingState): string {
  return `[ ] ${state}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
