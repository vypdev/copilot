import type { BugbotProjectedFinding } from '../../domain/bugbot/review_projection';
import { githubUsersMatch } from '../../domain/github_user_policy';
import type {
  PullRequestReviewComment,
  PullRequestReviewSummary,
} from '../ports/pull_request_review_comment_ports';
import { parseMarker } from './bugbot_finding_marker_policy';

export interface OwnedBugbotReview {
  readonly review: PullRequestReviewSummary;
  readonly findings: readonly BugbotProjectedFinding[];
}

/** Associates trusted review summaries with every child finding they own. */
export function selectOwnedBugbotReviews(input: {
  readonly reviews: readonly PullRequestReviewSummary[];
  readonly comments: readonly PullRequestReviewComment[];
  readonly trustedAuthorLogin?: string;
  readonly findings: readonly BugbotProjectedFinding[];
}): OwnedBugbotReview[] {
  const findingById = new Map(input.findings.map((finding) => [finding.id, finding]));
  const childFindingIds = new Map<string, Set<string>>();
  for (const finding of input.findings) {
    if (!finding.parentReviewIdentity) continue;
    addFinding(childFindingIds, finding.parentReviewIdentity, finding.id);
  }
  for (const comment of input.comments) {
    if (
      !comment.parentReviewIdentity
      || !isTrustedBugbotAuthor(comment.authorLogin, input.trustedAuthorLogin)
    ) continue;
    for (const marker of parseMarker(comment.body)) {
      addFinding(childFindingIds, comment.parentReviewIdentity, marker.findingId);
    }
  }
  return input.reviews.flatMap((review) => {
    if (!isTrustedBugbotAuthor(review.authorLogin, input.trustedAuthorLogin)) return [];
    const ids = new Set(childFindingIds.get(review.identity) ?? []);
    for (const marker of parseMarker(review.body)) ids.add(marker.findingId);
    if (ids.size === 0) return [];
    return [{
      review,
      findings: [...ids]
        .map((id) => findingById.get(id))
        .filter((finding): finding is BugbotProjectedFinding => finding !== undefined),
    }];
  });
}

export function isTrustedBugbotAuthor(
  authorLogin: string | undefined,
  trustedAuthorLogin: string | undefined,
): boolean {
  if (!authorLogin?.trim() || !trustedAuthorLogin?.trim()) return false;
  return githubUsersMatch(authorLogin, trustedAuthorLogin);
}

function addFinding(
  findingsByReview: Map<string, Set<string>>,
  reviewIdentity: string,
  findingId: string,
): void {
  const ids = findingsByReview.get(reviewIdentity) ?? new Set<string>();
  ids.add(findingId);
  findingsByReview.set(reviewIdentity, ids);
}
