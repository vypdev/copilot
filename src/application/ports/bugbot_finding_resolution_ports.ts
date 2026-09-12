import type { BoundBugbotIssueCommentUpdatePort } from "./bugbot_issue_write_ports";
import type { BoundBugbotPullRequestResolutionPort } from "./bugbot_pull_request_resolution_ports";

export interface BugbotFindingResolutionPorts {
  issueComments: BoundBugbotIssueCommentUpdatePort;
  pullRequestComments: BoundBugbotPullRequestResolutionPort;
}
