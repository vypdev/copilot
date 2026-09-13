import { Result } from "../../../../data/model/result";
import type { BoundBranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runDeployAddedWorkflow } from "./deploy_added_workflow";
import type { DeployAddedContext, MoveIssueToInProgressContext } from '../../issue_workflow_context';

export class DeployAddedUseCase implements ParamUseCase<DeployAddedContext, Result[]> {
  taskId: string = "DeployAddedUseCase";

  constructor(
    private readonly branchWorkflowPort: BoundBranchWorkflowPort,
    private readonly moveIssueToInProgressUseCase: ParamUseCase<MoveIssueToInProgressContext, Result[]>,
  ) {}

  async invoke(param: DeployAddedContext): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runDeployAddedWorkflow(
      param,
      this.taskId,
      this.branchWorkflowPort,
      this.moveIssueToInProgressUseCase,
    );
  }
}
