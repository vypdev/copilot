import type { BoundBugbotPullRequestResolutionPort } from "../../../../../application/ports/bugbot_pull_request_resolution_ports";
import { PullRequestReviewOperationError } from "../../../../../application/ports/pull_request_review_errors";
import {
  buildMarker,
  buildResolvedFindingNote,
  parseMarker,
  replaceMarkerInBody,
} from '../../../../policies/bugbot_finding_marker_policy';
import type { BugbotFindingResolution } from '../../../../../domain/bugbot/finding';
import type { BugbotMessageCatalog } from '../../../../policies/bugbot_message_catalog';

export interface PullRequestFindingResolution {
  findingId: string;
  commentIdentity: string;
  pullRequestNumber: number;
  resolution?: BugbotFindingResolution;
}

export async function resolvePullRequestFinding(
  repository: BoundBugbotPullRequestResolutionPort,
  resolution: PullRequestFindingResolution,
  catalog?: BugbotMessageCatalog,
): Promise<void> {
  const comments = await repository.listPullRequestReviewComments(
    resolution.pullRequestNumber,
  );
  const comment = comments.find(
    (candidate) => candidate.identity === resolution.commentIdentity,
  );
  if (comment?.body == null) {
    throw new PullRequestReviewOperationError("resolve-thread");
  }

  const marker = parseMarker(comment.body).find(
    (candidate) => candidate.findingId === resolution.findingId,
  );
  if (marker == null) {
    throw new PullRequestReviewOperationError("resolve-thread");
  }

  if (!marker.resolved) {
    const reason = resolution.resolution ?? 'fixed';
    const replacement = `${buildResolvedFindingNote(reason, catalog)}${buildMarker(resolution.findingId, true, marker.fingerprint, marker.semanticFingerprint, reason)}`;
    const replaced = replaceMarkerInBody(
      comment.body,
      resolution.findingId,
      true,
      replacement,
    );
    if (!replaced.found) throw new PullRequestReviewOperationError('update-comment');
    if (replaced.changed) {
      // Persist Bugbot's durable intent first. If the native mutation fails, a
      // retry can safely repair the thread toward this explicit marker state.
      await repository.updatePullRequestReviewComment(
        resolution.commentIdentity,
        replaced.updated,
      );
    }
  }

  await repository.resolvePullRequestReviewThread(
    resolution.pullRequestNumber,
    resolution.commentIdentity,
  );
}
