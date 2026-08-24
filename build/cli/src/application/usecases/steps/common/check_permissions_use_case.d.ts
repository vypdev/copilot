import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { OrganizationMembersPort } from "../../../ports/organization_members_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class CheckPermissionsUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly organizationMembersPort;
    taskId: string;
    constructor(organizationMembersPort: OrganizationMembersPort);
    invoke(param: Execution): Promise<Result[]>;
}
