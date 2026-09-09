import type { DeploymentContinuationPort } from "../../../application/ports/deployment_orchestration_ports";
import type { BranchWorkflowPort } from "../../../application/ports/branch_workflow_ports";

export class DeploymentContinuationRepository implements DeploymentContinuationPort {
  constructor(private readonly workflow: BranchWorkflowPort) {}

  async dispatch(
    owner: string,
    repository: string,
    workflow: string,
    ref: string,
    operationId: string,
    issue: number,
    version: string,
    token: string,
  ): Promise<void> {
    await this.workflow.executeWorkflow(owner, repository, ref, workflow, {
      mode: "publish",
      "operation-id": operationId,
      issue: String(issue),
      version,
    }, token);
  }
}
