import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { OrganizationMembersPort } from "../../../ports/organization_members_ports";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runCheckPermissionsWorkflow } from "./check_permissions_workflow";

export class CheckPermissionsUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "CheckPermissionsUseCase";

  constructor(private readonly organizationMembersPort: OrganizationMembersPort) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runCheckPermissionsWorkflow(param, this.taskId, {
      organizationMembersPort: this.organizationMembersPort,
    });
  }
}
