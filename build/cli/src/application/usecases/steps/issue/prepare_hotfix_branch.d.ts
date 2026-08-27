import type { CommitTagQueryPort, LinkedBranchCommandPort } from "../../../ports/branch_preparation_ports";
import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
export declare function prepareHotfixBranch(param: Execution, commitTagQuery: CommitTagQueryPort, linkedBranchCommand: LinkedBranchCommandPort, branches: string[], taskId: string): Promise<Result[]>;
