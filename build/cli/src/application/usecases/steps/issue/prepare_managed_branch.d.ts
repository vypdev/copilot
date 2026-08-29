import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import type { BranchPropagationDelayPort, LinkedBranchCommandPort } from "../../../ports/branch_preparation_ports";
import { ParamUseCase } from "../../base/param_usecase";
export interface ManagedBranchPreparationDependencies {
    branchNamePort: BranchNamePort;
    linkedBranchCommandPort: LinkedBranchCommandPort;
    branchPropagationDelayPort: BranchPropagationDelayPort;
    moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>;
}
export declare function prepareManagedBranch(param: Execution, issueTitle: string, branches: readonly string[], taskId: string, dependencies: ManagedBranchPreparationDependencies): Promise<Result[]>;
