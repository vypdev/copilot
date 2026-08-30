import type { BugbotIssueCommentUpdatePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import { stripTrailingCommentWatermarks } from "../../../../../utils/comment_watermark";
import { buildMarker, parseMarker, replaceMarkerInBody } from "./marker";
import type { BugbotFindingResolution } from './types';

export interface IssueFindingResolution {
  findingId: string;
  comment: { id: number; body: string };
  owner: string;
  repo: string;
  issueNumber: number;
  token: string;
  resolution?: BugbotFindingResolution;
}

function resolvedNote(resolution: BugbotFindingResolution): string {
  if (resolution === 'dismissed') return "\n\n---\n**Dismissed** (explicitly dismissed by an authorized user).\n";
  if (resolution === 'obsolete') return "\n\n---\n**Resolved** (no longer applies in the latest analysis).\n";
  return "\n\n---\n**Resolved** (configured agent confirmed fixed in latest analysis).\n";
}

export async function resolveIssueFinding(
  repository: BugbotIssueCommentUpdatePort,
  resolution: IssueFindingResolution,
): Promise<void> {
  const body = stripTrailingCommentWatermarks(resolution.comment.body);
  const marker = parseMarker(body).find(
    (candidate) => candidate.findingId === resolution.findingId,
  );
  if (marker == null || marker.resolved) return;

  const reason = resolution.resolution ?? 'fixed';
  const replacement = `${resolvedNote(reason)}${buildMarker(resolution.findingId, true, marker.fingerprint, reason)}`;
  const replaced = replaceMarkerInBody(
    body,
    resolution.findingId,
    true,
    replacement,
  );
  if (!replaced.found || !replaced.changed) return;

  await repository.updateComment(
    resolution.owner,
    resolution.repo,
    resolution.issueNumber,
    resolution.comment.id,
    replaced.updated,
    resolution.token,
  );
}
