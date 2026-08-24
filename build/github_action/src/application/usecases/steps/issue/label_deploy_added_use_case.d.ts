import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import { ParamUseCase } from "../../base/param_usecase";
import type { ProjectBoardCommandPort } from "../../../../application/ports/project_board_command_ports";
export declare class DeployAddedUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly projectBoardPort;
    private readonly branchWorkflowPort;
    taskId: string;
    constructor(projectBoardPort: ProjectBoardCommandPort, branchWorkflowPort: BranchWorkflowPort);
    invoke(param: Execution): Promise<Result[]>;
}
