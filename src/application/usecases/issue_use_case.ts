import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { runIssueWorkflow } from "./issue_workflow";

export class IssueUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "IssueUseCase";

  constructor(
    private readonly recommendStepsUseCase: ParamUseCase<Execution, Result[]>,
    private readonly answerIssueHelpUseCase: ParamUseCase<Execution, Result[]>,
    private readonly workflowSteps: IssueWorkflowSteps,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runIssueWorkflow(param, this.taskId, {
      recommendStepsUseCase: this.recommendStepsUseCase,
      answerIssueHelpUseCase: this.answerIssueHelpUseCase,
      workflowSteps: this.workflowSteps,
    });
  }
}
