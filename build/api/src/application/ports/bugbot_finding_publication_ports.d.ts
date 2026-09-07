import type { BugbotIssueCommentWritePort } from "./bugbot_issue_write_ports";
import type { BugbotPullRequestWritePort } from "./bugbot_pull_request_write_ports";
/** Minimum capabilities needed to publish or refresh findings. */
export interface BugbotFindingPublicationPorts {
    issueComments: BugbotIssueCommentWritePort;
    pullRequestComments: BugbotPullRequestWritePort;
}
