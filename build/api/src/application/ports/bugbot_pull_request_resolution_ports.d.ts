import type { PullRequestReviewComment, PullRequestReviewCommentListQueryPort, PullRequestReviewCommentUpdatePort, PullRequestReviewThreadCommandPort } from "./pull_request_review_comment_ports";
export interface BugbotPullRequestResolutionPort extends PullRequestReviewCommentListQueryPort, PullRequestReviewCommentUpdatePort, PullRequestReviewThreadCommandPort {
}
export interface BoundBugbotPullRequestResolutionPort {
    listPullRequestReviewComments(pullRequestNumber: number): Promise<PullRequestReviewComment[]>;
    updatePullRequestReviewComment(commentIdentity: string, body: string): Promise<void>;
    resolvePullRequestReviewThread(pullRequestNumber: number, commentIdentity: string): Promise<void>;
    unresolvePullRequestReviewThread(pullRequestNumber: number, commentIdentity: string): Promise<void>;
}
