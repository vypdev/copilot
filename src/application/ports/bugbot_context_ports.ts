import type { BugbotIssueReadPort } from './bugbot_issue_read_ports';
import type { BugbotPullRequestReadPort } from './bugbot_pull_request_read_ports';
import type { BugbotRuleFileQueryPort } from './bugbot_rule_ports';
import type { PullRequestReviewSummaryQueryPort } from './pull_request_review_comment_ports';
import type { BugbotReviewNavigationPort } from './bugbot_review_navigation_ports';

export interface BugbotContextPorts {
    issue: BugbotIssueReadPort;
    pullRequest: BugbotPullRequestReadPort;
    /** Required for coherent PR review projection. */
    reviewState: PullRequestReviewSummaryQueryPort;
    /** Provider-owned navigation used by durable review presentation. */
    navigation: BugbotReviewNavigationPort;
    rules: BugbotRuleFileQueryPort;
}
