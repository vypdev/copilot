import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
import type { PullRequestReviewerPort } from '../../../../application/ports/pull_request_reviewer_ports';
export interface AssignReviewersWorkflowDependencies {
    issueRepository: IssueAssigneePort;
    pullRequestRepository: PullRequestReviewerPort;
    projectRepository: OrganizationMembersPort;
}
/** Selects and requests reviewers without coupling the use-case boundary to GitHub. */
export declare function runAssignReviewersWorkflow(param: Execution, dependencies: AssignReviewersWorkflowDependencies): Promise<Result[]>;
