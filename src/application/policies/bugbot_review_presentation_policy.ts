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
  const heading = language === 'es-ES' ? '## 🤖 Estado de Bugbot' : '## 🤖 Bugbot status';
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
  const action = projection.outcome === 'partial' || projection.outcome === 'failed' || unknown > 0
    ? language === 'es-ES'
      ? 'Ejecuta `/copilot recheck`; los detalles técnicos indican qué quedó pendiente.'
      : 'Run `/copilot recheck`; the technical details identify what remains pending.'
    : actionable.length === 0
      ? language === 'es-ES' ? 'No se requiere ninguna acción.' : 'No action required.'
      : language === 'es-ES'
        ? 'Revisa los threads enlazados o comenta `/copilot fix all`.'
        : 'Review the linked threads or comment `/copilot fix all`.';
  const stateHeading = language === 'es-ES' ? '### Estado actual' : '### Current state';
  const findingsHeading = language === 'es-ES' ? '### Hallazgos' : '### Findings';
  const coverageHeading = language === 'es-ES' ? '### Cobertura' : '### Coverage';
  const stateColumn = language === 'es-ES' ? 'Estado' : 'State';
  const countColumn = language === 'es-ES' ? 'Cantidad' : 'Count';
  const rows = [
    ['Open / reopened', projection.counts.open + projection.counts.reopened],
    ['Verification required', projection.counts['verification-required']],
    ['Fixed', projection.counts.fixed],
    ['Obsolete', projection.counts.obsolete],
    ['Dismissed', projection.counts.dismissed],
    ['Unknown', projection.counts.unknown],
  ].map(([state, count]) => `| ${state} | ${count} |`);
  const findingRows = projection.findings.length === 0
    ? [language === 'es-ES' ? '- No hay hallazgos registrados.' : '- No findings recorded.']
    : projection.findings.slice(0, 20).map((finding) => renderFindingRow(finding));
  if (projection.findings.length > 20) {
    findingRows.push(
      language === 'es-ES'
        ? `- …y ${projection.findings.length - 20} más.`
        : `- …and ${projection.findings.length - 20} more.`,
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
  const details = projection.errors.length === 0
    ? (language === 'es-ES' ? 'Ninguna operación pendiente.' : 'No pending operations.')
    : projection.errors
        .slice(0, 10)
        .map((error) => `- ${sanitizeAgentMarkdown(error, 500)}`)
        .join('\n');
  return [
    buildBugbotStatusMarker(projection),
    heading,
    '',
    `> **${language === 'es-ES' ? 'Estado actual' : 'Current status'}:** ${status}`,
    '>',
    `> **${language === 'es-ES' ? 'Acción requerida' : 'Action required'}:** ${action}`,
    '',
    stateHeading,
    '',
    `| ${stateColumn} | ${countColumn} |`,
    '| --- | ---: |',
    ...rows,
    '',
    findingsHeading,
    '',
    ...findingRows,
    '',
    coverageHeading,
    '',
    ...(coverageRows.length > 0
      ? coverageRows
      : [language === 'es-ES' ? '- Cobertura completa; ningún límite alcanzado.' : '- Complete coverage; no limit reached.']),
    '',
    navigation,
    '',
    '<details>',
    `<summary>${language === 'es-ES' ? 'Detalles técnicos' : 'Technical details'}</summary>`,
    '',
    `Projection: ${projection.outcome} · Analyzed head: ${projection.analyzedHeadSha} · Digest: ${projection.digest}`,
    '',
    details,
    '',
    '</details>',
  ].join('\n');
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
  if (state === 'fixed' || state === 'obsolete' || state === 'dismissed') return `[x] ${state}`;
  return `[ ] ${state}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
