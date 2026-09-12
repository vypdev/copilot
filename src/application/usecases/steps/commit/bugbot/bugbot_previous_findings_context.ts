import { renderUntrustedField } from '../../../../../domain/security/untrusted_content';
import { MAX_FINDING_BODY_LENGTH } from './build_bugbot_fix_prompt';

export interface PreviousBugbotFinding {
  readonly id: string;
  readonly fullBody: string;
  readonly createdAt?: string;
  readonly providerId?: string;
}

export interface PreviousBugbotFindingsContext {
  readonly block: string;
  readonly selected: readonly PreviousBugbotFinding[];
  readonly omitted: number;
}

export const MAX_PREVIOUS_FINDINGS = 100;
export const MAX_PREVIOUS_FINDINGS_BLOCK_LENGTH = 48_000;

export function buildPreviousFindingsContext(
  previousFindings: readonly PreviousBugbotFinding[],
): PreviousBugbotFindingsContext {
  if (previousFindings.length === 0) return { block: '', selected: [], omitted: 0 };
  const prefix = `
**Previously reported issues (not yet marked resolved).** For each one we show the exact comment we posted (title, description, location, suggestion, and a hidden marker with the finding id at the end).

`;
  const suffix = `
**Your task 2:** For each finding above, analyze the current code and decide:
- If the problem **still exists** (same code or same issue present): do **not** include it in \`resolved_findings\`.
- If the problem **no longer applies** (e.g. that code was removed or refactored away): include \`{ "id": "<exact id>", "resolution": "obsolete" }\` in \`resolved_findings\`.
- If the problem **has been fixed** (code was changed and the issue is resolved): include \`{ "id": "<exact id>", "resolution": "fixed" }\` in \`resolved_findings\`.

Return in \`resolved_findings\` only entries from the list above that are now fixed or obsolete. Use each exact id shown in the "Finding id" line.`;
  const omissionNoticeBudget = 256;
  const findingsBudget = Math.max(
    0,
    MAX_PREVIOUS_FINDINGS_BLOCK_LENGTH - prefix.length - suffix.length - omissionNoticeBudget,
  );
  const newestFirst = [...previousFindings].sort(compareNewestFirst);
  const selectedNewestFirst = selectWithinBudget(newestFirst, findingsBudget);
  const selected = [...selectedNewestFirst].reverse();
  const omitted = previousFindings.length - selected.length;
  const omissionNote = omitted > 0
    ? `\n\n**${omitted} older finding(s) were omitted from this prompt because of the context budget. Do not resolve an omitted finding in this response.**`
    : '';
  return {
    block: `${prefix}${selected.map(formatFinding).join('\n')}${omissionNote}${suffix}`,
    selected,
    omitted,
  };
}

function selectWithinBudget(
  newestFirst: readonly PreviousBugbotFinding[],
  maximumLength: number,
): PreviousBugbotFinding[] {
  const selected: PreviousBugbotFinding[] = [];
  let totalLength = 0;
  for (const finding of newestFirst) {
    if (selected.length >= MAX_PREVIOUS_FINDINGS) break;
    const itemLength = formatFinding(finding).length;
    if (totalLength + itemLength > maximumLength) break;
    selected.push(finding);
    totalLength += itemLength;
  }
  return selected;
}

function formatFinding(finding: PreviousBugbotFinding): string {
  return `---\n**Finding id (use this exact id in resolved_findings if fixed/obsolete):** \`${finding.id.replace(/`/g, '\\`')}\`\n\n**Full comment as posted (including metadata at the end):**\n${renderUntrustedField(finding.fullBody, `github.previous-finding.${finding.id}`, MAX_FINDING_BODY_LENGTH)}\n`;
}

function compareNewestFirst(left: PreviousBugbotFinding, right: PreviousBugbotFinding): number {
  return timestamp(right.createdAt) - timestamp(left.createdAt)
    || String(right.providerId ?? right.id).localeCompare(String(left.providerId ?? left.id));
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
