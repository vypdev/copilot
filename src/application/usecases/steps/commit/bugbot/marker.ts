/**
 * Bugbot marker: we embed a hidden HTML comment in each finding comment (issue and PR)
 * with finding_id and resolved flag. This lets us (1) find existing findings when loading
 * context, (2) update the same comment when OpenCode re-reports or marks resolved, (3) match
 * threads when the user replies "fix it" in a PR.
 */

import { BUGBOT_MARKER_PREFIX } from "../../../../../utils/constants";
import type { BugbotFinding } from "./types";

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
    throw new Error(
      findingId.trim().length === 0
        ? "Finding ID is empty after marker sanitization."
        : findingId.trim().length > MAX_FINDING_ID_LENGTH
          ? "Finding ID exceeds the maximum marker length."
          : "Finding ID contains marker-breaking characters.",
    );
  }
  return safeId;
}

export function buildMarker(findingId: string, resolved: boolean): string {
  const safeId = requireFindingIdForMarker(findingId);
  return `<!-- ${BUGBOT_MARKER_PREFIX} finding_id:"${safeId}" resolved:${resolved} -->`;
}

export function parseMarker(
  body: string | null,
): Array<{ findingId: string; resolved: boolean }> {
  if (!body) return [];
  const results: Array<{ findingId: string; resolved: boolean }> = [];
  const regex = new RegExp(
    `<!--\\s*${BUGBOT_MARKER_PREFIX}\\s+finding_id:\\s*"([^"]+)"\\s+resolved:(true|false)\\s*-->`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    results.push({ findingId: m[1], resolved: m[2] === "true" });
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
    `<!--\\s*${BUGBOT_MARKER_PREFIX}\\s+finding_id:\\s*"${idForRegex}"\\s+resolved:(?:true|false)\\s*-->`,
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

/** Extract title from comment body (first ## line) for context when sending to OpenCode. */
export function extractTitleFromBody(body: string | null): string {
  if (!body) return "";
  const match = body.match(/^##\s+(.+)$/m);
  return (match?.[1] ?? "").trim();
}

/** Builds the visible comment body (title, severity, location, description, suggestion) plus the hidden marker for this finding. */
export function buildCommentBody(
  finding: BugbotFinding,
  resolved: boolean,
): string {
  const severity = finding.severity
    ? `**Severity:** ${finding.severity}\n\n`
    : "";
  const fileLine =
    finding.file != null
      ? `**Location:** \`${finding.file}${finding.line != null ? `:${finding.line}` : ""}\`\n\n`
      : "";
  const suggestion = finding.suggestion
    ? `**Suggested fix:**\n${finding.suggestion}\n\n`
    : "";
  const resolvedNote = resolved
    ? "\n\n---\n**Resolved** (no longer reported in latest analysis).\n"
    : "";
  const marker = buildMarker(finding.id, resolved);
  return `## ${finding.title}

${severity}${fileLine}${finding.description}
${suggestion}${resolvedNote}${marker}`;
}
