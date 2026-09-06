/**
 * Bugbot marker: we embed a hidden HTML comment in each finding comment (issue and PR)
 * with finding_id and resolved flag. This lets us (1) find existing findings when loading
 * context, (2) update the same comment when the agent re-reports or marks resolved, (3) match
 * threads when the user replies "fix it" in a PR.
 */

import { BUGBOT_MARKER_PREFIX } from '../../../../policies/bugbot_constants';
import { ApplicationError } from "../../../../errors/application_error";
import type { BugbotFinding, BugbotFindingResolution } from "./types";
import { sanitizeAgentMarkdown } from "../../../../../application/policies/github_comment_publication_policy";

/** Maximum lossless finding identity accepted by the marker contract. */
export const MAX_FINDING_ID_LENGTH = 200;

/** Safe character set for finding IDs in regex (alphanumeric, path/segment chars). */
const SAFE_FINDING_ID_REGEX_CHARS = /^[a-zA-Z0-9_\-.:/]+$/;

/**
 * Canonicalize only insignificant outer whitespace. Internal characters are
 * never removed: doing so would make distinct finding identities collide.
 */
export function sanitizeFindingIdForMarker(findingId: string): string {
  return findingId.trim();
}

export function normalizeFindingIdForMarker(
  findingId: string,
): string | null {
  const safeId = sanitizeFindingIdForMarker(findingId);
  return safeId.length > 0 &&
    safeId.length <= MAX_FINDING_ID_LENGTH &&
    !/[\r\n]|-->|<!|[>"]/.test(safeId)
    ? safeId
    : null;
}

function requireFindingIdForMarker(findingId: string): string {
  const safeId = normalizeFindingIdForMarker(findingId);
  if (safeId == null) {
    throw new ApplicationError(
      findingId.trim().length === 0
        ? "Finding ID is empty after marker sanitization."
        : findingId.trim().length > MAX_FINDING_ID_LENGTH
          ? "Finding ID exceeds the maximum marker length."
          : "Finding ID contains marker-breaking characters.",
      'validation',
    );
  }
  return safeId;
}

export function buildMarker(
  findingId: string,
  resolved: boolean,
  fingerprint?: string,
  resolution?: BugbotFindingResolution,
): string {
    const safeId = requireFindingIdForMarker(findingId);
    const safeFingerprint = fingerprint?.match(/^fp-[a-f0-9]{8}$/)?.[0];
    const safeResolution = resolved && resolution && ['fixed', 'obsolete', 'dismissed'].includes(resolution)
      ? ` finding_resolution:"${resolution}"`
      : '';
    return `<!-- ${BUGBOT_MARKER_PREFIX} finding_id:"${safeId}" resolved:${resolved}${safeFingerprint ? ` finding_fingerprint:"${safeFingerprint}"` : ''}${safeResolution} -->`;
}

export function parseMarker(
  body: string | null,
): Array<{ findingId: string; resolved: boolean; fingerprint?: string; resolution?: BugbotFindingResolution }> {
  if (!body) return [];
  const results: Array<{ findingId: string; resolved: boolean; fingerprint?: string; resolution?: BugbotFindingResolution }> = [];
  const regex = new RegExp(
    `<!--\\s*${BUGBOT_MARKER_PREFIX}\\s+finding_id:\\s*"([^"]+)"\\s+resolved:(true|false)(?:\\s+finding_fingerprint:\\s*"(fp-[a-f0-9]{8})")?(?:\\s+finding_resolution:\\s*"(fixed|obsolete|dismissed)")?\\s*-->`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    results.push({
      findingId: m[1],
      resolved: m[2] === "true",
      ...(m[3] ? { fingerprint: m[3] } : {}),
      ...(m[4] ? { resolution: m[4] as BugbotFindingResolution } : {}),
    });
  }
  return results;
}

/**
 * Regex to match the marker for a specific finding (same flexible format as parseMarker).
 * Finding IDs from external data (comments, API) are length-limited and validated to mitigate ReDoS.
 */
export function markerRegexForFinding(findingId: string): RegExp {
  const safeId = requireFindingIdForMarker(findingId);
  const idForRegex = SAFE_FINDING_ID_REGEX_CHARS.test(safeId)
    ? safeId
    : safeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `<!--\\s*${BUGBOT_MARKER_PREFIX}\\s+finding_id:\\s*"${idForRegex}"\\s+resolved:(?:true|false)(?:\\s+finding_fingerprint:\\s*"fp-[a-f0-9]{8}")?(?:\\s+finding_resolution:\\s*"(?:fixed|obsolete|dismissed)")?\\s*-->`,
    "g",
  );
}

/**
 * Find the marker for this finding in body (using same pattern as parseMarker) and replace it.
 * Returns whether the marker exists independently from whether the body changed.
 */
export function replaceMarkerInBody(
  body: string,
  findingId: string,
  newResolved: boolean,
  replacement?: string,
): { updated: string; found: boolean; changed: boolean } {
  const regex = markerRegexForFinding(findingId);
  const newMarker = replacement ?? buildMarker(findingId, newResolved);
  const found = regex.test(body);
  regex.lastIndex = 0;
  if (!found) return { updated: body, found: false, changed: false };
  const updated = body.replace(regex, newMarker);
  return { updated, found: true, changed: updated !== body };
}

/** Extract title from comment body (first ## line) for context when sending to the agent. */
export function extractTitleFromBody(body: string | null): string {
  if (!body) return "";
  const match = body.match(/^##\s+(.+)$/m);
  return (match?.[1] ?? "").trim();
}

/** Builds the visible comment body (title, severity, location, description, suggestion) plus the hidden marker for this finding. */
export function buildCommentBody(
  finding: BugbotFinding,
  resolved: boolean,
  resolution?: BugbotFindingResolution,
): string {
  const safeTitle = sanitizeAgentMarkdown(finding.title, 500) || "Potential problem";
  const safeDescription = sanitizeAgentMarkdown(finding.description, 8_000) || "No description provided.";
  const safeSeverity = sanitizeAgentMarkdown(finding.severity, 32);
  const safeFile = sanitizeAgentMarkdown(finding.file, 500).replace(/`/g, "\\`");
  const safeSuggestion = sanitizeAgentMarkdown(finding.suggestion, 8_000);
  const safeEvidence = sanitizeAgentMarkdown(finding.evidence, 8_000);
  const safeCategory = sanitizeAgentMarkdown(finding.category, 32);
  const severity = safeSeverity
    ? `**Severity:** ${safeSeverity}\n\n`
    : "";
  const fileLine =
    safeFile
      ? `**Location:** \`${safeFile}${finding.line != null ? `:${finding.line}${finding.endLine != null && finding.endLine > finding.line ? `-${finding.endLine}` : ''}` : ""}\`\n\n`
      : "";
  const metadata = [
    safeCategory ? `**Category:** ${safeCategory}` : '',
    finding.confidence !== undefined ? `**Confidence:** ${Math.round(finding.confidence * 100)}%` : '',
  ].filter(Boolean).join(' · ');
  const evidence = safeEvidence ? `**Evidence:**\n${safeEvidence}\n\n` : '';
  const suggestion = safeSuggestion
    ? `**Suggested fix:**\n${safeSuggestion}\n\n`
    : "";
  const resolvedNote = resolved
    ? "\n\n---\n**Resolved** (no longer reported in latest analysis).\n"
    : "";
  const marker = buildMarker(finding.id, resolved, finding.fingerprint, resolution);
  return `## ${safeTitle}

${severity}${metadata ? `${metadata}\n\n` : ''}${fileLine}${safeDescription}
${evidence}
${suggestion}${resolvedNote}${marker}`;
}
