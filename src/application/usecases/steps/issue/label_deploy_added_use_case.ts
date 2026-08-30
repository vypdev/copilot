import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runDeployAddedWorkflow } from "./deploy_added_workflow";

export class DeployAddedUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "DeployAddedUseCase";

  constructor(
    private readonly branchWorkflowPort: BranchWorkflowPort,
    private readonly moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runDeployAddedWorkflow(
      param,
      this.taskId,
      this.branchWorkflowPort,
      this.moveIssueToInProgressUseCase,
    );
  }
}
