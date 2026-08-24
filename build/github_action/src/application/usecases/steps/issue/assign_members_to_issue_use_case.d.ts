import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueAssigneePort } from "../../../../application/ports/issue_management_ports";
import type { OrganizationMembersPort } from "../../../../application/ports/organization_members_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class AssignMemberToIssueUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    private readonly projectRepository;
    taskId: string;
    constructor(issueRepository: IssueAssigneePort, projectRepository: OrganizationMembersPort);
    invoke(param: Execution): Promise<Result[]>;
}
