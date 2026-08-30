import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
import type { PullRequestReviewerPort } from '../../../../application/ports/pull_request_reviewer_ports';
import { ParamUseCase } from '../../base/param_usecase';
/** Application boundary for requesting the configured number of reviewers. */
export declare class AssignReviewersToIssueUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    private readonly pullRequestRepository;
    private readonly projectRepository;
    taskId: string;
    constructor(issueRepository: IssueAssigneePort, pullRequestRepository: PullRequestReviewerPort, projectRepository: OrganizationMembersPort);
    invoke(param: Execution): Promise<Result[]>;
}
