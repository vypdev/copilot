import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
import type { PullRequestReviewerPort } from '../../../../application/ports/pull_request_reviewer_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runAssignReviewersWorkflow } from './assign_reviewers_workflow';

/** Application boundary for requesting the configured number of reviewers. */
export class AssignReviewersToIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'AssignReviewersToIssueUseCase';

    constructor(
        private readonly issueRepository: IssueAssigneePort,
        private readonly pullRequestRepository: PullRequestReviewerPort,
        private readonly projectRepository: OrganizationMembersPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runAssignReviewersWorkflow(param, {
            issueRepository: this.issueRepository,
            pullRequestRepository: this.pullRequestRepository,
            projectRepository: this.projectRepository,
        });
    }
}
