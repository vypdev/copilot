import type { Execution } from "../../../../../data/model/execution";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestQueryPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import { Result } from "../../../../../data/model/result";
export interface DetectBugbotFixIntentWorkflowPorts {
    pullRequestQueryPort: BugbotPullRequestQueryPort;
    aiRepository: FindingsQueryPort;
    contextPorts: BugbotContextPorts;
}
/** Detects whether a comment targets Bugbot findings and returns the validated intent payload. */
export declare function runDetectBugbotFixIntentWorkflow(param: Execution, ports: DetectBugbotFixIntentWorkflowPorts): Promise<Result[]>;
