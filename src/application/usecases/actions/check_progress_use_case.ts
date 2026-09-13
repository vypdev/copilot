import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { BoundIssueLabelsPort, BoundIssueProgressPort } from '../../ports/issue_management_ports';
import type { BoundPullRequestBranchQueryPort } from '../../ports/pull_request_branch_ports';
import type { BoundBranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import type { ProgressContext } from '../push_single_action_contexts';
import { ParamUseCase } from '../base/param_usecase';
import { runCheckProgressWorkflow } from './check_progress_workflow';

/** Application boundary for assessing and publishing issue progress. */
export class CheckProgressUseCase implements ParamUseCase<ProgressContext, Result[]> {
    taskId: string = 'CheckProgressUseCase';

    constructor(
        private readonly issueDescriptionQueryPort: BoundIssueDescriptionQueryPort,
        private readonly issueLabelsPort: BoundIssueLabelsPort,
        private readonly issueProgressPort: BoundIssueProgressPort,
        private readonly branchRepository: BoundBranchListQueryPort,
        private readonly pullRequestRepository: BoundPullRequestBranchQueryPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: ProgressContext): Promise<Result[]> {
        return await runCheckProgressWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            branchRepository: this.branchRepository,
            pullRequestRepository: this.pullRequestRepository,
            issueLabelsPort: this.issueLabelsPort,
            issueProgressPort: this.issueProgressPort,
            aiRepository: this.aiRepository,
        });
    }
}
