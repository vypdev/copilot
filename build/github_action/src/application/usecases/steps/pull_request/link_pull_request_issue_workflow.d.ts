import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import type { PullRequestIssueLinkPort } from '../../../ports/pull_request_issue_link_ports';
export declare function runLinkPullRequestIssue(param: Execution, taskId: string, pullRequestIssueLinkPort: PullRequestIssueLinkPort, eventualConsistencyDelayPort: EventualConsistencyDelayPort): Promise<Result[]>;
