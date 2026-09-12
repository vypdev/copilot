import { Result } from "../../../../data/model/result";
import type { BoundOrganizationMembersPort } from "../../../ports/organization_members_ports";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runCheckPermissionsWorkflow } from "./check_permissions_workflow";

import type { CheckPermissionsContext } from "./check_permissions_workflow";

export class CheckPermissionsUseCase implements ParamUseCase<CheckPermissionsContext, Result[]> {
  taskId: string = "CheckPermissionsUseCase";

  constructor(private readonly organizationMembersPort: BoundOrganizationMembersPort) {}

  async invoke(param: CheckPermissionsContext): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runCheckPermissionsWorkflow(param, this.taskId, {
      organizationMembersPort: this.organizationMembersPort,
    });
  }
}
