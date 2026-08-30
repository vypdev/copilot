import type { PullRequestReviewComment } from "../../../../ports/pull_request_review_comment_ports";
import {
  MAX_FINDING_BODY_LENGTH,
  truncateFindingBody,
} from "./build_bugbot_fix_prompt";
import { normalizeFindingIdForMarker, parseMarker } from "./marker";
import {
  isExistingFindingFullyResolved,
  type ExistingByFindingId,
} from "./types";

export interface BugbotComment {
  id: number;
  body: string | null;
}

export interface ParsedBugbotFindingComments {
  /** Full bodies for issue-comment read-modify-write operations. */
  issueComments: BugbotComment[];
  existingByFindingId: ExistingByFindingId;
  /** Prompt-bounded PR bodies keyed by canonical finding ID. */
  prFindingIdToBody: Record<string, string>;
}

export function parseBugbotFindingComments(
  issueComments: BugbotComment[],
  pullRequestCommentsByNumber: ReadonlyMap<
    number,
    PullRequestReviewComment[]
  >,
): ParsedBugbotFindingComments {
  const existingByFindingId = parseIssueFindingMarkers(issueComments);
  const pullRequestFindings = parsePullRequestFindingMarkers(pullRequestCommentsByNumber);
  mergeFindingContexts(existingByFindingId, pullRequestFindings.existingByFindingId);
  return {
    issueComments,
    existingByFindingId,
    prFindingIdToBody: pullRequestFindings.prFindingIdToBody,
  };
}

function parseIssueFindingMarkers(issueComments: BugbotComment[]): ExistingByFindingId {
  const findings: ExistingByFindingId = {};
  for (const comment of issueComments) {
    for (const marker of parseMarker(comment.body)) {
      const findingId = normalizeFindingIdForMarker(marker.findingId);
      if (findingId == null) continue;
      findings[findingId] = {
        ...(findings[findingId] ?? {}),
        issue: { commentId: comment.id, resolved: marker.resolved, ...(marker.fingerprint ? { fingerprint: marker.fingerprint } : {}) },
      };
    }
  }
  return findings;
}

function parsePullRequestFindingMarkers(
  pullRequestCommentsByNumber: ReadonlyMap<number, PullRequestReviewComment[]>,
): { existingByFindingId: ExistingByFindingId; prFindingIdToBody: Record<string, string> } {
  const existingByFindingId: ExistingByFindingId = {};
  const prFindingIdToBody: Record<string, string> = {};
  for (const [pullRequestNumber, comments] of pullRequestCommentsByNumber) {
    parsePullRequestComments(comments, pullRequestNumber, existingByFindingId, prFindingIdToBody);
  }
  return { existingByFindingId, prFindingIdToBody };
}

function parsePullRequestComments(
  comments: PullRequestReviewComment[],
  pullRequestNumber: number,
  existingByFindingId: ExistingByFindingId,
  prFindingIdToBody: Record<string, string>,
): void {
  for (const comment of comments) {
    const body = comment.body ?? "";
    for (const marker of parseMarker(body)) {
      const findingId = normalizeFindingIdForMarker(marker.findingId);
      if (findingId == null) continue;
      existingByFindingId[findingId] = {
        ...(existingByFindingId[findingId] ?? {}),
        pullRequest: {
          commentIdentity: comment.identity,
          pullRequestNumber,
          resolved: marker.resolved,
          ...(marker.fingerprint ? { fingerprint: marker.fingerprint } : {}),
        },
      };
      prFindingIdToBody[findingId] = truncateFindingBody(body, MAX_FINDING_BODY_LENGTH);
    }
  }
}

function mergeFindingContexts(target: ExistingByFindingId, source: ExistingByFindingId): void {
  for (const [findingId, context] of Object.entries(source)) {
    target[findingId] = { ...(target[findingId] ?? {}), ...context };
  }
}

export interface PreviousBugbotFinding {
  id: string;
  fullBody: string;
}

export function collectPreviousBugbotFindings(
  issueComments: BugbotComment[],
  existingByFindingId: ExistingByFindingId,
  prFindingIdToBody: Record<string, string>,
): PreviousBugbotFinding[] {
  return Object.entries(existingByFindingId).flatMap(([findingId, data]) => {
    if (isExistingFindingFullyResolved(data)) return [];
    const issueBody =
      data.issue != null && !data.issue.resolved
        ? (issueComments.find(
            (comment) => comment.id === data.issue?.commentId,
          )?.body ?? null)
        : null;
    const pullRequestBody =
      data.pullRequest != null && !data.pullRequest.resolved
        ? (prFindingIdToBody[findingId] ?? null)
        : null;
    const rawBody = (issueBody ?? pullRequestBody ?? "").trim();
    return rawBody
      ? [
          {
            id: findingId,
            fullBody: truncateFindingBody(rawBody, MAX_FINDING_BODY_LENGTH),
          },
        ]
      : [];
  });
}

export function buildPreviousFindingsBlock(
  previousFindings: PreviousBugbotFinding[],
): string {
  if (previousFindings.length === 0) return "";
  const items = previousFindings
    .map(
      (finding) =>
        `---\n**Finding id (use this exact id in resolved_finding_ids if resolved/no longer applies):** \`${finding.id.replace(/`/g, "\\`")}\`\n\n**Full comment as posted (including metadata at the end):**\n${finding.fullBody}\n`,
    )
    .join("\n");
  return `
**Previously reported issues (not yet marked resolved).** For each one we show the exact comment we posted (title, description, location, suggestion, and a hidden marker with the finding id at the end).

${items}
**Your task 2:** For each finding above, analyze the current code and decide:
- If the problem **still exists** (same code or same issue present): do **not** include its id in \`resolved_finding_ids\`.
- If the problem **no longer applies** (e.g. that code was removed or refactored away): include its id in \`resolved_finding_ids\`.
- If the problem **has been fixed** (code was changed and the issue is resolved): include its id in \`resolved_finding_ids\`.

Return in \`resolved_finding_ids\` only the ids from the list above that are now fixed or no longer apply. Use the exact id shown in each "Finding id" line.`;
}
