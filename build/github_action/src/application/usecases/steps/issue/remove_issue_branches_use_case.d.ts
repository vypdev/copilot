import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchLifecyclePort } from "../../../ports/branch_lifecycle_ports";
import { ParamUseCase } from "../../base/param_usecase";
/**
 * Remove any branch created for this issue
 */
export declare class RemoveIssueBranchesUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly branchLifecyclePort;
    taskId: string;
    constructor(branchLifecyclePort: BranchLifecyclePort);
    invoke(param: Execution): Promise<Result[]>;
}
