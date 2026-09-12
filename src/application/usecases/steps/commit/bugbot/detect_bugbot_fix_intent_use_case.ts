import { Result } from "../../../../../data/model/result";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import { logInfo } from "../../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../../utils/task_emoji";
import { ParamUseCase } from "../../../base/param_usecase";
import { runDetectBugbotFixIntentWorkflow } from "./detect_bugbot_fix_intent_workflow";
import type { BugbotFixIntentContext } from './bugbot_review_operation_context';

const TASK_ID = "DetectBugbotFixIntentUseCase";

/** Application boundary for detecting Bugbot fix intent in user comments. */
export class DetectBugbotFixIntentUseCase implements ParamUseCase<BugbotFixIntentContext, Result[]> {
  taskId: string = TASK_ID;

  constructor(
    private readonly aiRepository: FindingsQueryPort,
    private readonly contextPorts: BugbotContextPorts,
  ) {}

  async invoke(param: BugbotFixIntentContext): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runDetectBugbotFixIntentWorkflow(param, {
      aiRepository: this.aiRepository,
      contextPorts: this.contextPorts,
    });
  }
}
