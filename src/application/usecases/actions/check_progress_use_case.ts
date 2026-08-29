import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../ports/pull_request_branch_ports';
import type { BranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import { ParamUseCase } from '../base/param_usecase';
import { runCheckProgressWorkflow } from './check_progress_workflow';

/** Application boundary for assessing and publishing issue progress. */
export class CheckProgressUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CheckProgressUseCase';

    constructor(
        private readonly issueRepository: IssueDescriptionQueryPort & IssueLabelsPort & IssueProgressPort,
        private readonly branchRepository: BranchListQueryPort,
        private readonly pullRequestRepository: PullRequestBranchQueryPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runCheckProgressWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueRepository,
            branchRepository: this.branchRepository,
            pullRequestRepository: this.pullRequestRepository,
            issueRepository: this.issueRepository,
            aiRepository: this.aiRepository,
        });
    }
}
