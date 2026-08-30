import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { BranchMergePort } from '../../../application/ports/branch_merge_ports';
import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
import { ParamUseCase } from '../base/param_usecase';
/** Application boundary for completing the post-deployment issue lifecycle. */
export declare class DeployedActionUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueLabelsPort;
    private readonly issueClosurePort;
    private readonly branchMergePort;
    taskId: string;
    constructor(issueLabelsPort: IssueLabelsPort, issueClosurePort: IssueClosurePort, branchMergePort: BranchMergePort);
    invoke(param: Execution): Promise<Result[]>;
}
