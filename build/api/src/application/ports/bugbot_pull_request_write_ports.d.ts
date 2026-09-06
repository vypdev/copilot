import type { PullRequestReviewCommentCommandPort, PullRequestReviewThreadCommandPort } from "./pull_request_review_comment_ports";
/** Publication may refresh a comment and reopen its thread when a finding returns. */
export interface BugbotPullRequestWritePort extends PullRequestReviewCommentCommandPort, Pick<PullRequestReviewThreadCommandPort, "unresolvePullRequestReviewThread"> {
}
