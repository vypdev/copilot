import type { BugbotRuleFileQueryPort } from './bugbot_rule_ports';
import type { BugbotPullRequestIdentity, BugbotSourceCoverage } from '../../domain/bugbot/context';
import type { PullRequestReviewDiffSnapshot } from './bugbot_pull_request_read_ports';
import type { BugbotIssueComment } from './bugbot_issue_read_ports';
import type { PullRequestReviewComment, PullRequestReviewThreadState } from './pull_request_review_comment_ports';
export interface BoundedBugbotRead<T> {
    readonly value: T;
    readonly coverage: BugbotSourceCoverage;
}
export interface BoundBugbotContextReadPorts {
    getPullRequest(pullRequestNumber: number): Promise<BugbotPullRequestIdentity>;
    findOpenPullRequestsByExactHead(headOwner: string, headRef: string): Promise<readonly BugbotPullRequestIdentity[]>;
    listIssueComments(issueNumber: number): Promise<BoundedBugbotRead<readonly BugbotIssueComment[]>>;
    listPullRequestReviewComments(pullRequestNumber: number): Promise<BoundedBugbotRead<readonly PullRequestReviewComment[]>>;
    listPullRequestReviewThreadStates(pullRequestNumber: number): Promise<BoundedBugbotRead<Readonly<Record<string, PullRequestReviewThreadState>>>>;
    getReviewDiffSnapshot(pullRequestNumber: number): Promise<BoundedBugbotRead<PullRequestReviewDiffSnapshot>>;
    getPullRequestHeadSha(pullRequestNumber: number): Promise<string | undefined>;
    getPullRequestReviewCommentBody(pullRequestNumber: number, commentId: number): Promise<string | null>;
    loadRules(paths: readonly string[]): ReturnType<BugbotRuleFileQueryPort['loadRules']>;
}
/** Repository-bound, credential-free context reads exposed to Bugbot use cases. */
export type BugbotContextPorts = BoundBugbotContextReadPorts;
