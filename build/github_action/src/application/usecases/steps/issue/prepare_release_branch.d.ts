import type { LinkedBranchCommandPort } from "../../../ports/branch_preparation_ports";
import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
export declare function prepareReleaseBranch(param: Execution, linkedBranchCommand: LinkedBranchCommandPort, branches: string[], taskId: string): Promise<Result[]>;
