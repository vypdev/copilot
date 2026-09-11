import type { BugbotIssueCommentWritePort } from "./bugbot_issue_write_ports";
import type { BugbotPullRequestWritePort } from "./bugbot_pull_request_write_ports";
import type { PullRequestReviewSummaryUpdatePort } from './pull_request_review_comment_ports';

/** Minimum capabilities needed to publish or refresh findings. */
export interface BugbotFindingPublicationPorts {
  issueComments: BugbotIssueCommentWritePort;
  pullRequestComments: BugbotPullRequestWritePort;
  /** Review-summary mutations are segregated from inline finding publication. */
  reviewState: PullRequestReviewSummaryUpdatePort;
}
