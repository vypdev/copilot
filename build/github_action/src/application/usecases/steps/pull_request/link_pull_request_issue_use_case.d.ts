import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { PullRequestIssueLinkPort } from "../../../ports/pull_request_issue_link_ports";
import type { EventualConsistencyDelayPort } from "../../../ports/eventual_consistency_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class LinkPullRequestIssueUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly pullRequestIssueLinkPort;
    private readonly eventualConsistencyDelayPort;
    taskId: string;
    constructor(pullRequestIssueLinkPort: PullRequestIssueLinkPort, eventualConsistencyDelayPort: EventualConsistencyDelayPort);
    invoke(param: Execution): Promise<Result[]>;
}
