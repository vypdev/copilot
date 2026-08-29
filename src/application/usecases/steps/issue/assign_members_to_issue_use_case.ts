import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runAssignMembersWorkflow } from './assign_members_workflow';

/** Application boundary for assigning issue or pull-request members. */
export class AssignMemberToIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'AssignMemberToIssueUseCase';

    constructor(
        private readonly issueRepository: IssueAssigneePort,
        private readonly projectRepository: OrganizationMembersPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runAssignMembersWorkflow(param, {
            issueRepository: this.issueRepository,
            projectRepository: this.projectRepository,
        });
    }
}
