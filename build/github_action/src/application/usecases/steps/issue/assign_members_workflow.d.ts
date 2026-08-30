import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
export interface AssignMembersWorkflowDependencies {
    issueRepository: IssueAssigneePort;
    projectRepository: OrganizationMembersPort;
}
/** Assigns the creator and remaining project members according to the pure assignment policy. */
export declare function runAssignMembersWorkflow(param: Execution, dependencies: AssignMembersWorkflowDependencies): Promise<Result[]>;
