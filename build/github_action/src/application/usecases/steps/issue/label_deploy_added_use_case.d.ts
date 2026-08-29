import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class DeployAddedUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly branchWorkflowPort;
    private readonly moveIssueToInProgressUseCase;
    taskId: string;
    constructor(branchWorkflowPort: BranchWorkflowPort, moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>);
    invoke(param: Execution): Promise<Result[]>;
}
