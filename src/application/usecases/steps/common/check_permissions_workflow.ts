import { Result } from "../../../../data/model/result";
import type { BoundOrganizationMembersPort } from "../../../ports/organization_members_ports";
import { logDebugInfo, logError, logWarn } from "../../../ports/logging_ports";
import { toApplicationError } from "../../../errors/application_error";

export interface CheckPermissionsWorkflowPorts {
  organizationMembersPort: BoundOrganizationMembersPort;
}

export interface CheckPermissionsContext {
  readonly target: {
    readonly type: "issue" | "pull request";
    readonly opened: boolean;
    readonly creator: string;
  };
  readonly mandatoryBranchRequired: boolean;
  readonly currentLabels: readonly string[];
}

export interface CheckPermissionsContextSource {
  readonly isIssue: boolean;
  readonly issue: { readonly opened: boolean; readonly creator: string };
  readonly pullRequest: { readonly opened: boolean; readonly creator: string };
  readonly labels: {
    readonly isMandatoryBranchedLabel: boolean;
    readonly currentIssueLabels: readonly string[];
  };
}

export function projectCheckPermissionsContext(source: CheckPermissionsContextSource): CheckPermissionsContext {
  const issueTarget = source.isIssue;
  return Object.freeze({
    target: Object.freeze({
      type: issueTarget ? "issue" : "pull request",
      opened: issueTarget ? source.issue.opened : source.pullRequest.opened,
      creator: issueTarget ? source.issue.creator : source.pullRequest.creator,
    }),
    mandatoryBranchRequired: source.labels.isMandatoryBranchedLabel,
    currentLabels: Object.freeze([...source.labels.currentIssueLabels]),
  });
}

export async function runCheckPermissionsWorkflow(
  param: CheckPermissionsContext,
  taskId: string,
  ports: CheckPermissionsWorkflowPorts,
): Promise<Result[]> {
  const inactiveResult = buildInactiveResult(param, taskId);
  if (inactiveResult) return [inactiveResult];

  try {
    const currentProjectMembers = await ports.organizationMembersPort.getAllMembers();
    const creator = param.target.creator;
    const creatorIsTeamMember = creator.length > 0 && currentProjectMembers.includes(creator);

    if (!param.mandatoryBranchRequired) {
      logDebugInfo("Skipping permission enforcement because a mandatory branch is not required.");
      return [new Result({ id: taskId, success: true, executed: true })];
    }

    logDebugInfo("Checking permissions because a mandatory branch is required.");
    if (creatorIsTeamMember) {
      return [new Result({ id: taskId, success: true, executed: true })];
    }

    const labels = param.currentLabels.join(",");
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
    const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to verify action permissions.');
    logError(semanticError);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to check action permissions."],
        errors: [semanticError],
      }),
    ];
  }
}

function buildInactiveResult(param: CheckPermissionsContext, taskId: string): Result | undefined {
  if (param.target.opened) return undefined;

  logDebugInfo(
    `Skipping permission checking. ${param.target.type === "issue" ? "Issue" : "Pull request"} state is not 'opened'.`,
  );
  return new Result({ id: taskId, success: true, executed: false });
}
