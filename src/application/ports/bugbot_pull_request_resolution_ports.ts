import type {
  PullRequestReviewThreadStateQueryPort,
  BoundPullRequestReviewThreadStateQueryPort,
  PullRequestReviewComment,
  PullRequestReviewCommentListQueryPort,
  PullRequestReviewCommentUpdatePort,
  PullRequestReviewThreadCommandPort,
} from "./pull_request_review_comment_ports";

export interface BugbotPullRequestResolutionPort
  extends
    PullRequestReviewCommentListQueryPort,
    PullRequestReviewCommentUpdatePort,
    PullRequestReviewThreadCommandPort,
    Partial<PullRequestReviewThreadStateQueryPort> {}

/** Re-adjudicating a withdrawn dismissal requires the optional fresh-thread query. */
export interface BoundBugbotPullRequestResolutionPort extends Partial<BoundPullRequestReviewThreadStateQueryPort> {
  listPullRequestReviewComments(pullRequestNumber: number): Promise<PullRequestReviewComment[]>;
  updatePullRequestReviewComment(commentIdentity: string, body: string): Promise<void>;
  resolvePullRequestReviewThread(
    pullRequestNumber: number,
    commentIdentity: string,
  ): Promise<void>;
  unresolvePullRequestReviewThread(
    pullRequestNumber: number,
    commentIdentity: string,
  ): Promise<void>;
}
