import type { BugbotPullRequestResolutionPort } from "../../../../../application/ports/bugbot_pull_request_resolution_ports";
import { PullRequestReviewOperationError } from "../../../../../application/ports/pull_request_review_errors";
import { buildMarker, parseMarker, replaceMarkerInBody } from "./marker";

export interface PullRequestFindingResolution {
  findingId: string;
  commentIdentity: string;
  pullRequestNumber: number;
  owner: string;
  repo: string;
  token: string;
}

const RESOLVED_NOTE =
  "\n\n---\n**Resolved** (OpenCode confirmed fixed in latest analysis).\n";

export async function resolvePullRequestFinding(
  repository: BugbotPullRequestResolutionPort,
  resolution: PullRequestFindingResolution,
): Promise<void> {
  const comments = await repository.listPullRequestReviewComments(
    resolution.owner,
    resolution.repo,
    resolution.pullRequestNumber,
    resolution.token,
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

  await repository.resolvePullRequestReviewThread(
    resolution.owner,
    resolution.repo,
    resolution.pullRequestNumber,
    resolution.commentIdentity,
    resolution.token,
  );

  if (marker.resolved) return;
  const replacement = `${RESOLVED_NOTE}${buildMarker(
    resolution.findingId,
    true,
  )}`;
  const replaced = replaceMarkerInBody(
    comment.body,
    resolution.findingId,
    true,
    replacement,
  );
  if (!replaced.found || !replaced.changed) return;

  await repository.updatePullRequestReviewComment(
    resolution.owner,
    resolution.repo,
    resolution.commentIdentity,
    replaced.updated,
    resolution.token,
  );
}
