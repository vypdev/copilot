import type { BugbotPullRequestResolutionPort } from "../../../../../application/ports/bugbot_pull_request_resolution_ports";
import { PullRequestReviewOperationError } from "../../../../../application/ports/pull_request_review_errors";
import { buildMarker, parseMarker, replaceMarkerInBody } from "./marker";
import type { BugbotFindingResolution } from './types';

export interface PullRequestFindingResolution {
  findingId: string;
  commentIdentity: string;
  pullRequestNumber: number;
  owner: string;
  repo: string;
  token: string;
  resolution?: BugbotFindingResolution;
}

function resolvedNote(resolution: BugbotFindingResolution): string {
  if (resolution === 'dismissed') return "\n\n---\n**Dismissed** (explicitly dismissed by an authorized user).\n";
  if (resolution === 'obsolete') return "\n\n---\n**Resolved** (no longer applies in the latest analysis).\n";
  return "\n\n---\n**Resolved** (configured agent confirmed fixed in latest analysis).\n";
}

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
  const reason = resolution.resolution ?? 'fixed';
  const replacement = `${resolvedNote(reason)}${buildMarker(resolution.findingId, true, marker.fingerprint, reason)}`;
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
