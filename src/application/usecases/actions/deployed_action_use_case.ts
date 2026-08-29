import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { BranchMergePort } from '../../../application/ports/branch_merge_ports';
import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
import { ParamUseCase } from '../base/param_usecase';
import { runDeployedActionWorkflow } from './deployed_action_workflow';

/** Application boundary for completing the post-deployment issue lifecycle. */
export class DeployedActionUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'DeployedActionUseCase';

    constructor(
        private readonly issueLabelsPort: IssueLabelsPort,
        private readonly issueClosurePort: IssueClosurePort,
        private readonly branchMergePort: BranchMergePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runDeployedActionWorkflow(param, {
            issueLabelsPort: this.issueLabelsPort,
            issueClosurePort: this.issueClosurePort,
            branchMergePort: this.branchMergePort,
        });
    }
}
