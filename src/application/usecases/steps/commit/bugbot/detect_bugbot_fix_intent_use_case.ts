import type { Execution } from "../../../../../data/model/execution";
import { Result } from "../../../../../data/model/result";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestQueryPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import { logInfo } from "../../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../../utils/task_emoji";
import { ParamUseCase } from "../../../base/param_usecase";
import { runDetectBugbotFixIntentWorkflow } from "./detect_bugbot_fix_intent_workflow";

const TASK_ID = "DetectBugbotFixIntentUseCase";

/** Application boundary for detecting Bugbot fix intent in user comments. */
export class DetectBugbotFixIntentUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = TASK_ID;

  constructor(
    private readonly pullRequestQueryPort: BugbotPullRequestQueryPort,
    private readonly aiRepository: FindingsQueryPort,
    private readonly contextPorts: BugbotContextPorts,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runDetectBugbotFixIntentWorkflow(param, {
      pullRequestQueryPort: this.pullRequestQueryPort,
      aiRepository: this.aiRepository,
      contextPorts: this.contextPorts,
    });
  }
}
