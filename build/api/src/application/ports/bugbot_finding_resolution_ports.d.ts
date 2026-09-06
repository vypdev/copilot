import type { BugbotIssueCommentUpdatePort } from "./bugbot_issue_write_ports";
import type { BugbotPullRequestResolutionPort } from "./bugbot_pull_request_resolution_ports";
export interface BugbotFindingResolutionPorts {
    issueComments: BugbotIssueCommentUpdatePort;
    pullRequestComments: BugbotPullRequestResolutionPort;
}
