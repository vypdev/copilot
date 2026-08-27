import type { BranchListQueryPort } from '../../../application/ports/branch_lifecycle_ports';
import { Execution } from '../../../data/model/execution';
export declare function findIssueBranch(param: Execution, repository: BranchListQueryPort): Promise<string | undefined>;
