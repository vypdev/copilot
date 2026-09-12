import type { BoundBugbotIssueCommentWritePort } from "./bugbot_issue_write_ports";
import type { BoundBugbotPullRequestWritePort } from "./bugbot_pull_request_write_ports";

/** Minimum capabilities needed to publish or refresh findings. */
export interface BugbotFindingPublicationPorts {
  issueComments: BoundBugbotIssueCommentWritePort;
  pullRequestComments: BoundBugbotPullRequestWritePort;
}
