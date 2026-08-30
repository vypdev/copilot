import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { OrganizationMembersPort } from "../../../ports/organization_members_ports";
export interface CheckPermissionsWorkflowPorts {
    organizationMembersPort: OrganizationMembersPort;
}
export declare function runCheckPermissionsWorkflow(param: Execution, taskId: string, ports: CheckPermissionsWorkflowPorts): Promise<Result[]>;
