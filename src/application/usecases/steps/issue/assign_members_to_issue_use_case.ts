import { Result } from '../../../../data/model/result';
import type { BoundIssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { BoundOrganizationMemberSelectionPort } from '../../../../application/ports/organization_members_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runAssignMembersWorkflow } from './assign_members_workflow';
import type { AssignmentContext } from '../../issue_workflow_context';

/** Application boundary for assigning issue or pull-request members. */
export class AssignMemberToIssueUseCase implements ParamUseCase<AssignmentContext, Result[]> {
    taskId = 'AssignMemberToIssueUseCase';

    constructor(
        private readonly issueRepository: BoundIssueAssigneePort,
        private readonly projectRepository: BoundOrganizationMemberSelectionPort,
    ) {}

    async invoke(param: AssignmentContext): Promise<Result[]> {
        return await runAssignMembersWorkflow(param, {
            issueRepository: this.issueRepository,
            projectRepository: this.projectRepository,
        });
    }
}
