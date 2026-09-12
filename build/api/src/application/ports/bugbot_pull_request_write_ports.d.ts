import type { PullRequestReviewCommentDraft, PullRequestReviewReference, PullRequestReviewCommentCommandPort, PullRequestReviewThreadCommandPort } from "./pull_request_review_comment_ports";
/** Publication may refresh a comment and reopen its thread when a finding returns. */
export interface BugbotPullRequestWritePort extends PullRequestReviewCommentCommandPort, Pick<PullRequestReviewThreadCommandPort, "unresolvePullRequestReviewThread"> {
}
export interface BoundBugbotPullRequestWritePort {
    createReviewWithComments(pullRequestNumber: number, commitId: string, body: string, comments: PullRequestReviewCommentDraft[]): Promise<PullRequestReviewReference | undefined>;
    updatePullRequestReviewComment(commentIdentity: string, body: string): Promise<void>;
    unresolvePullRequestReviewThread(pullRequestNumber: number, commentIdentity: string): Promise<void>;
}
