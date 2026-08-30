import type { Execution } from "../../../../../data/model/execution";
import { Result } from "../../../../../data/model/result";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestQueryPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import { ParamUseCase } from "../../../base/param_usecase";
/** Application boundary for detecting Bugbot fix intent in user comments. */
export declare class DetectBugbotFixIntentUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly pullRequestQueryPort;
    private readonly aiRepository;
    private readonly contextPorts;
    taskId: string;
    constructor(pullRequestQueryPort: BugbotPullRequestQueryPort, aiRepository: FindingsQueryPort, contextPorts: BugbotContextPorts);
    invoke(param: Execution): Promise<Result[]>;
}
