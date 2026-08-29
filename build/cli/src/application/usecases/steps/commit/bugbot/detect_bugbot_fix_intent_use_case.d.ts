import type { Execution } from "../../../../../data/model/execution";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestQueryPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import { ParamUseCase } from "../../../base/param_usecase";
import { Result } from "../../../../../data/model/result";
/**
 * Asks the configured findings agent whether the user comment is a request to fix one or more
 * bugbot findings, and which finding ids to target. Used from issue comments and PR
 * review comments. When isFixRequest is true and targetFindingIds is non-empty, the
 * caller (IssueCommentUseCase / PullRequestReviewCommentUseCase) runs the autofix flow.
 * Requires unresolved findings (from loadBugbotContext); otherwise we skip and return empty.
 */
export declare class DetectBugbotFixIntentUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly pullRequestQueryPort;
    private readonly aiRepository;
    private readonly contextPorts;
    taskId: string;
    constructor(pullRequestQueryPort: BugbotPullRequestQueryPort, aiRepository: FindingsQueryPort, contextPorts: BugbotContextPorts);
    invoke(param: Execution): Promise<Result[]>;
}
