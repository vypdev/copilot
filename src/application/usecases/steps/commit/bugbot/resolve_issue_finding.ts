import type { BoundBugbotIssueCommentUpdatePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import { stripTrailingCommentWatermarks } from "../../../../../utils/comment_watermark";
import {
  buildMarker,
  buildResolvedFindingNote,
  parseMarker,
  replaceMarkerInBody,
} from '../../../../policies/bugbot_finding_marker_policy';
import type { BugbotFindingResolution } from '../../../../../domain/bugbot/finding';
import type { BugbotMessageCatalog } from '../../../../policies/bugbot_message_catalog';

export interface IssueFindingResolution {
  findingId: string;
  comment: { id: number; body: string };
  issueNumber: number;
  resolution?: BugbotFindingResolution;
}

export async function resolveIssueFinding(
  repository: BoundBugbotIssueCommentUpdatePort,
  resolution: IssueFindingResolution,
  catalog?: BugbotMessageCatalog,
): Promise<void> {
  const body = stripTrailingCommentWatermarks(resolution.comment.body);
  const marker = parseMarker(body).find(
    (candidate) => candidate.findingId === resolution.findingId,
  );
  if (marker == null || marker.resolved) return;

  const reason = resolution.resolution ?? 'fixed';
  const replacement = `${buildResolvedFindingNote(reason, catalog)}${buildMarker(resolution.findingId, true, marker.fingerprint, marker.semanticFingerprint, reason)}`;
  const replaced = replaceMarkerInBody(
    body,
    resolution.findingId,
    true,
    replacement,
  );
  if (!replaced.found || !replaced.changed) return;

  await repository.updateComment(
    resolution.issueNumber,
    resolution.comment.id,
    replaced.updated,
  );
}
