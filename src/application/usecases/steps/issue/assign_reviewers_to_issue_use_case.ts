import { Result } from '../../../../data/model/result';
import type { BoundIssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { BoundOrganizationMemberSelectionPort } from '../../../../application/ports/organization_members_ports';
import type { BoundPullRequestReviewerPort } from '../../../../application/ports/pull_request_reviewer_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runAssignReviewersWorkflow } from './assign_reviewers_workflow';
import type { AssignReviewersContext } from '../../pull_request_workflow_context';

/** Application boundary for requesting the configured number of reviewers. */
export class AssignReviewersToIssueUseCase implements ParamUseCase<AssignReviewersContext, Result[]> {
    taskId = 'AssignReviewersToIssueUseCase';

    constructor(
        private readonly issueRepository: BoundIssueAssigneePort,
        private readonly pullRequestRepository: BoundPullRequestReviewerPort,
        private readonly projectRepository: BoundOrganizationMemberSelectionPort,
    ) {}

    async invoke(param: AssignReviewersContext): Promise<Result[]> {
        return await runAssignReviewersWorkflow(param, {
            issueRepository: this.issueRepository,
            pullRequestRepository: this.pullRequestRepository,
            projectRepository: this.projectRepository,
        });
    }
}
