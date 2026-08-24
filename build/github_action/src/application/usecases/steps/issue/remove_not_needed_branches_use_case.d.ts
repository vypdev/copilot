import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchLifecyclePort, BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class RemoveNotNeededBranchesUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly branchLifecyclePort;
    private readonly branchNamePort;
    taskId: string;
    constructor(branchLifecyclePort: BranchLifecyclePort, branchNamePort: BranchNamePort);
    invoke(param: Execution): Promise<Result[]>;
    private findCandidates;
    private removeBranch;
    private missingTitleResult;
}
