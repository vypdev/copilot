import type { BugbotIssueComment } from './bugbot_issue_read_ports';
import type { BoundBugbotIssueCommentWritePort } from './bugbot_issue_write_ports';
import type { BugbotReviewNavigation } from './bugbot_review_navigation_ports';
import type { PullRequestReviewComment, PullRequestReviewSummary, PullRequestReviewThreadState } from './pull_request_review_comment_ports';
/** Repository-bound reads required to acquire one coherent final Bugbot snapshot. */
export interface BugbotReconciliationSnapshotPorts {
    listIssueComments(issueNumber: number): Promise<BugbotIssueComment[]>;
    listPullRequestReviewComments(pullRequestNumber: number): Promise<PullRequestReviewComment[]>;
    listPullRequestReviewThreadStates(pullRequestNumber: number): Promise<Record<string, PullRequestReviewThreadState>>;
    listPullRequestReviews(pullRequestNumber: number): Promise<PullRequestReviewSummary[]>;
    getPullRequestHeadSha(pullRequestNumber: number): Promise<string | undefined>;
    navigationForPullRequest(pullRequestNumber: number, headSha: string): BugbotReviewNavigation;
}
/** Repository-bound presentation mutations; credentials never enter the use case. */
export interface BugbotPresentationMutationPorts {
    readonly comments: BoundBugbotIssueCommentWritePort;
    updatePullRequestReview(pullRequestNumber: number, reviewIdentity: string, body: string): Promise<void>;
}
