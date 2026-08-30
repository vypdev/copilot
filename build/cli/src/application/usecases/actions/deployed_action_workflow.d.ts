import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { BranchMergePort } from '../../../application/ports/branch_merge_ports';
import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
export interface DeployedActionWorkflowDependencies {
    issueLabelsPort: IssueLabelsPort;
    issueClosurePort: IssueClosurePort;
    branchMergePort: BranchMergePort;
}
/** Replaces the deploy label, performs ordered merges, and closes only after all succeed. */
export declare function runDeployedActionWorkflow(param: Execution, dependencies: DeployedActionWorkflowDependencies): Promise<Result[]>;
