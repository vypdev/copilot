import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { OrganizationMembersPort } from "../../../ports/organization_members_ports";
import { logDebugInfo, logError, logInfo, logWarn } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class CheckPermissionsUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CheckPermissionsUseCase';
    
    constructor(private readonly organizationMembersPort: OrganizationMembersPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];

        /**
         * If a release/hotfix issue was opened, check if author is a member of the project.
         */
        if (param.isIssue && !param.issue.opened) {
            logDebugInfo(`Ignoring permission checking. Issue state is not 'opened'.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: false,
                })
            );
            return result;
        } else if (param.isPullRequest && !param.pullRequest.opened) {
            logDebugInfo(`Ignoring permission checking. Pull request state is not 'opened'.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: false,
                })
            );
            return result;
        }

        try {
            const currentProjectMembers = await this.organizationMembersPort.getAllMembers(
                param.owner,
                param.tokens.token,
            )

            const creator = param.isIssue ? param.issue.creator : param.pullRequest.creator;

            const creatorIsTeamMember = creator.length > 0
                && currentProjectMembers.indexOf(creator) > -1;

            if (param.labels.isMandatoryBranchedLabel) {
                logDebugInfo(`Ignoring permission checking. Issue doesn't require mandatory branch.`)
                if (creatorIsTeamMember) {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                        })
                    );
                } else {
                    logWarn(`CheckPermissions: @${param.issue.creator} not authorized to create [${param.labels.currentIssueLabels.join(',')}] issues.`);
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: false,
                            executed: true,
                            steps: [`@${param.issue.creator} was not authorized to create **[${param.labels.currentIssueLabels.join(',')}]** issues.`],
                        })
                    );
                }
            } else {
                logDebugInfo(`Ignoring permission checking. Issue doesn't require mandatory branch.`)
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                    })
                );
            }
        } catch (error) {
            logError(`CheckPermissions: failed to get project members or check creator.`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Tried to check action permissions.`],
                    errors: [error],
                })
            );
        }

        return result;
    }
}
