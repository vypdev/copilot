import type { BugbotIssueReadPort } from './bugbot_issue_read_ports';
import type { BugbotPullRequestReadPort } from './bugbot_pull_request_read_ports';

export interface BugbotContextPorts {
    issue: BugbotIssueReadPort;
    pullRequest: BugbotPullRequestReadPort;
}
