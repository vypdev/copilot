import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchWorkflowPort } from "../../../ports/branch_workflow_ports";
import type { ParamUseCase } from "../../base/param_usecase";
export declare function runDeployAddedWorkflow(param: Execution, taskId: string, branchWorkflowPort: BranchWorkflowPort, moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>): Promise<Result[]>;
