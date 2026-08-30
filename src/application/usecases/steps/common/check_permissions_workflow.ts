import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { OrganizationMembersPort } from "../../../ports/organization_members_ports";
import { logDebugInfo, logError, logWarn } from "../../../ports/logging_ports";

export interface CheckPermissionsWorkflowPorts {
  organizationMembersPort: OrganizationMembersPort;
}

export async function runCheckPermissionsWorkflow(
  param: Execution,
  taskId: string,
  ports: CheckPermissionsWorkflowPorts,
): Promise<Result[]> {
  const inactiveResult = buildInactiveResult(param, taskId);
  if (inactiveResult) return [inactiveResult];

  try {
    const currentProjectMembers = await ports.organizationMembersPort.getAllMembers(
      param.owner,
      param.tokens.token,
    );
    const creator = getCreator(param);
    const creatorIsTeamMember = creator.length > 0 && currentProjectMembers.includes(creator);

    if (!param.labels.isMandatoryBranchedLabel) {
      logDebugInfo("Skipping permission enforcement because a mandatory branch is not required.");
      return [new Result({ id: taskId, success: true, executed: true })];
    }

    logDebugInfo("Checking permissions because a mandatory branch is required.");
    if (creatorIsTeamMember) {
      return [new Result({ id: taskId, success: true, executed: true })];
    }

    const labels = param.labels.currentIssueLabels.join(",");
    logWarn(`CheckPermissions: @${creator} not authorized to create [${labels}] issues.`);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: [`@${creator} was not authorized to create **[${labels}]** issues.`],
      }),
    ];
  } catch (error) {
    logError(
      "CheckPermissions: failed to get project members or check creator.",
      error instanceof Error ? { stack: error.stack } : undefined,
    );
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to check action permissions."],
        errors: [error],
      }),
    ];
  }
}

function getCreator(param: Execution): string {
  return param.isIssue ? param.issue.creator : param.pullRequest.creator;
}

function buildInactiveResult(param: Execution, taskId: string): Result | undefined {
  const isClosedIssue = param.isIssue && !param.issue.opened;
  const isClosedPullRequest = param.isPullRequest && !param.pullRequest.opened;
  if (!isClosedIssue && !isClosedPullRequest) return undefined;

  logDebugInfo(
    `Skipping permission checking. ${param.isIssue ? "Issue" : "Pull request"} state is not 'opened'.`,
  );
  return new Result({ id: taskId, success: true, executed: false });
}
