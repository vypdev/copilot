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
import {
  resolveStaticBugbotCatalog,
  type BugbotMessageCatalog,
} from './bugbot_message_catalog';

export const BUGBOT_STATUS_MARKER_PREFIX = 'copilot-bugbot-status';
export const BUGBOT_REVIEW_MARKER_PREFIX = 'copilot-bugbot-review';
export const BUGBOT_REVIEW_STATUS_START = '<!-- copilot-bugbot-review-status:start';
export const BUGBOT_REVIEW_STATUS_END = '<!-- copilot-bugbot-review-status:end -->';
export const BUGBOT_REVIEW_OVERFLOW_MARKER = '<!-- copilot-bugbot-review-overflow schema="1" -->';

export type BugbotPresentationLinks = BugbotReviewNavigation;

export function normalizeBugbotPresentationLocale(locale: string): string {
  return resolveStaticBugbotCatalog(locale).locale;
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
  catalogOrLocale: BugbotMessageCatalog | string,
  links: BugbotPresentationLinks,
): string {
  const catalog = presentationCatalog(catalogOrLocale);
  const actionable = projection.findings.filter((finding) =>
    isBugbotActionableState(finding.state),
  );
  const unknown = projection.counts.unknown;
  const partialCoverage = projection.coverage.status === 'partial';
  const shortHead = projection.verifiedHeadSha.slice(0, 7);
  const heading = partialCoverage
    ? catalog.message('bugbot.status.heading.partial')
    : projection.outcome === 'partial' || projection.outcome === 'failed' || unknown > 0
      ? catalog.message('bugbot.status.heading.verification')
      : actionable.length === 0
        ? catalog.message('bugbot.status.heading.complete')
        : catalog.message('bugbot.status.heading.attention', { count: actionable.length }, actionable.length);
  const status = partialCoverage
    ? catalog.message('bugbot.status.partial', { commit: `\`${shortHead}\`` })
    : unknown > 0
    ? catalog.message('bugbot.status.unknown', { count: unknown, commit: `\`${shortHead}\`` }, unknown)
    : projection.outcome === 'partial' || projection.outcome === 'failed'
      ? catalog.message('bugbot.status.syncFailure', { commit: `\`${shortHead}\`` })
      : actionable.length === 0
        ? catalog.message('bugbot.status.clean', { commit: `\`${shortHead}\`` })
        : catalog.message('bugbot.status.attention', { count: actionable.length, commit: `\`${shortHead}\`` }, actionable.length);
  const action = partialCoverage
    ? catalog.message('bugbot.status.action.partial')
    : projection.outcome === 'partial' || projection.outcome === 'failed' || unknown > 0
    ? catalog.message('bugbot.status.action.recheck', { command: '`/copilot recheck`' })
    : actionable.length > 0
      ? catalog.message('bugbot.status.action.findings', { command: '`/copilot fix all`' })
      : undefined;
  const findingsHeading = `### ${catalog.message('bugbot.status.findingsHeading')}`;
  const visibleFindings = projection.findings.filter((finding) =>
    isBugbotActionableState(finding.state) || finding.state === 'unknown',
  );
  const findingRows = visibleFindings.slice(0, 20).map((finding) => renderFindingRow(finding));
  if (visibleFindings.length > 20) {
    findingRows.push(
      `- …${catalog.message('bugbot.common.more', { count: visibleFindings.length - 20 }, visibleFindings.length - 20)}`,
    );
  }
  const navigation = [
    `[${catalog.message('bugbot.status.nav.pullRequest')}](${links.pullRequestUrl})`,
    `[${catalog.message('bugbot.status.nav.verifiedCommit')}](${links.commitUrl})`,
    ...(links.runUrl
      ? [`[${catalog.message('bugbot.status.nav.workflowRun')}](${links.runUrl})`]
      : []),
  ].join(' · ');
  const coverageRows = projection.coverage.sources.map((source) => {
    const facts = [catalog.message('bugbot.coverage.retained', { count: source.itemsRetained })];
    if (source.omittedItems > 0) facts.push(catalog.message('bugbot.coverage.omitted', { count: source.omittedItems }));
    if (source.truncatedItems > 0) facts.push(catalog.message('bugbot.coverage.truncated', { count: source.truncatedItems }));
    if (source.providerLimitReached) facts.push(catalog.message('bugbot.coverage.providerLimit'));
    return `- ${source.source}: ${source.status}; ${facts.join(', ')}`;
  });
  const lines = [
    buildPublicationMarker({
      identity: { topic: 'bugbot', target: { kind: 'pull-request', number: projection.pullRequestNumber }, key: 'aggregate' },
      sourceVersion: `head:${projection.verifiedHeadSha}`,
      digest: projection.digest,
    }),
    buildBugbotStatusMarker(projection),
    `## ${heading}`,
    '',
    `> **${catalog.message('bugbot.status.currentStatus')}:** ${status}`,
  ];
  if (action) lines.push('>', `> **${catalog.message('bugbot.status.actionLabel')}:** ${action}`);
  if (findingRows.length > 0) lines.push('', findingsHeading, '', ...findingRows);
  if (partialCoverage) {
    lines.push(
      '',
      '<details>',
      `<summary>${catalog.message('bugbot.status.coverageSummary')}</summary>`,
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
      `<summary>${catalog.message('bugbot.status.recoverySummary')}</summary>`,
      '',
      ...projection.errors.slice(0, 10).map((error) => `- ${sanitizeAgentMarkdown(error, 500)}`),
      '',
      '</details>',
    );
  }
  lines.push('', navigation);
  return lines.join('\n');
}

type BugbotReviewSnapshotInput = {
  readonly reviewIdentity: string;
  readonly analyzedHeadSha: string;
  readonly currentHeadSha: string;
  readonly projectionDigest: string;
  readonly coverageStatus: 'complete' | 'partial';
  readonly findings: readonly BugbotProjectedFinding[];
  readonly statusUrl: string;
} & (
  | { readonly catalog: BugbotMessageCatalog; readonly locale?: never }
  | { readonly locale: string; readonly catalog?: never }
);

export function renderBugbotReviewSnapshot(
  originalBody: string | null,
  input: BugbotReviewSnapshotInput,
): string {
  const catalog = presentationCatalog(input.catalog ?? input.locale);
  const hasUntrackedOverflow = /copilot-bugbot-review-overflow|### (?:Additional findings omitted by the comment limit|Hallazgos adicionales omitidos por el límite de comentarios)/u.test(originalBody ?? '');
  const normalized = normalizeHistoricalSnapshot(originalBody ?? '', input.analyzedHeadSha, catalog);
  const actionable = input.findings.filter((finding) => isBugbotActionableState(finding.state)).length;
  const unknown = input.findings.filter((finding) => finding.state === 'unknown').length;
  const status = input.coverageStatus === 'partial'
    ? catalog.message('bugbot.snapshot.partial')
    : unknown > 0
    ? catalog.message('bugbot.snapshot.unknown', { count: unknown }, unknown)
    : actionable === 0 && hasUntrackedOverflow
      ? catalog.message('bugbot.snapshot.cleanTrackedOverflow')
      : actionable === 0
      ? catalog.message('bugbot.snapshot.clean')
      : hasUntrackedOverflow
        ? catalog.message('bugbot.snapshot.attentionTrackedOverflow', { count: actionable }, actionable)
        : catalog.message('bugbot.snapshot.attention', { count: actionable }, actionable);
  const linkLabel = catalog.message('bugbot.snapshot.aggregateLink');
  return [
    `<!-- ${BUGBOT_REVIEW_MARKER_PREFIX} schema="1" review="${input.reviewIdentity}" analyzed_head="${input.analyzedHeadSha}" -->`,
    `${BUGBOT_REVIEW_STATUS_START} digest="${input.projectionDigest}" -->`,
    `> **${catalog.message('bugbot.snapshot.currentStatus')}:** ${status}`,
    `> ${catalog.message('bugbot.snapshot.lastReconciled', { commit: `\`${input.currentHeadSha.slice(0, 7)}\`` })} [${linkLabel}](${input.statusUrl}).`,
    BUGBOT_REVIEW_STATUS_END,
    '',
    normalized,
  ].join('\n');
}

export function buildNewBugbotReviewSnapshotHeader(
  analyzedHeadSha: string,
  findingCount: number,
  inlineCount: number,
  catalogOrLocale: BugbotMessageCatalog | string,
): string {
  const catalog = presentationCatalog(catalogOrLocale);
  const commit = `\`${analyzedHeadSha.slice(0, 7)}\``;
  return [
    `<!-- ${BUGBOT_REVIEW_MARKER_PREFIX} schema="1" analyzed_head="${analyzedHeadSha}" -->`,
    `${BUGBOT_REVIEW_STATUS_START} digest="pending" -->`,
    `> **${catalog.message('bugbot.snapshot.currentStatus')}:** ${catalog.message('bugbot.snapshot.attention', { count: findingCount }, findingCount)}`,
    BUGBOT_REVIEW_STATUS_END,
    '',
    `## 🤖 ${catalog.message('bugbot.snapshot.heading')}`,
    [
      catalog.message('bugbot.snapshot.reported', { count: `**${findingCount}**`, commit }, findingCount),
      catalog.message('bugbot.snapshot.historical'),
      catalog.message('bugbot.snapshot.inline', { count: inlineCount }, inlineCount),
    ].join(' '),
  ].join('\n');
}

function normalizeHistoricalSnapshot(
  originalBody: string,
  analyzedHeadSha: string,
  catalog: BugbotMessageCatalog,
): string {
  let body = originalBody
    .replace(new RegExp(`<!--\\s*${BUGBOT_REVIEW_MARKER_PREFIX}\\s+schema="1"[^>]*-->\\s*`, 'gu'), '')
    .replace(new RegExp(`${escapeRegExp(BUGBOT_REVIEW_STATUS_START)}[\\s\\S]*?${escapeRegExp(BUGBOT_REVIEW_STATUS_END)}\\s*`, 'gu'), '')
    .trim();
  if (!/^## 🤖 .+$/mu.test(body)) {
    const heading = `## 🤖 ${catalog.message('bugbot.snapshot.heading')}`;
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

function presentationCatalog(value: BugbotMessageCatalog | string): BugbotMessageCatalog {
  return typeof value === 'string' ? resolveStaticBugbotCatalog(value) : value;
}
