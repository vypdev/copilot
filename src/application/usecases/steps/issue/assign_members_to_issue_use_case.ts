import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueAssigneePort } from "../../../../application/ports/issue_management_ports";
import type { OrganizationMembersPort } from "../../../../application/ports/organization_members_ports";
import { logDebugInfo, logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class AssignMemberToIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'AssignMemberToIssueUseCase';
    
    constructor(private readonly issueRepository: IssueAssigneePort, private readonly projectRepository: OrganizationMembersPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const desiredAssigneesCount = param.isIssue ?
            param.issue.desiredAssigneesCount : param.pullRequest.desiredAssigneesCount;

        const number = param.isIssue ? param.issue.number : param.pullRequest.number;
        const result: Result[] = [];

        try {
            logDebugInfo(`#${number} needs ${desiredAssigneesCount} assignees.`);

            const currentProjectMembers = await this.projectRepository.getAllMembers(
                param.owner,
                param.tokens.token,
            )

            const currentMembers = await this.issueRepository.getCurrentAssignees(
                param.owner,
                param.repo,
                number,
                param.tokens.token,
            );

            let remainingAssignees = desiredAssigneesCount - currentMembers.length;

            const pullRequestCreatorIsTeamMember = param.isPullRequest
                && param.pullRequest.creator.length > 0
                && currentProjectMembers.indexOf(param.pullRequest.creator) > -1
                && !currentMembers.includes(param.pullRequest.creator);

            const issueCreatorIsTeamMember = param.isIssue
                && param.issue.creator.length > 0
                && currentProjectMembers.indexOf(param.issue.creator) > -1
                && !currentMembers.includes(param.issue.creator);

            /**
             * Assign PR creator if applicable
             */
            if (pullRequestCreatorIsTeamMember) {
                const creator = param.pullRequest.creator;
                await this.issueRepository.assignMembersToIssue(
                    param.owner,
                    param.repo,
                    number,
                    [creator],
                    param.tokens.token,
                );
                logDebugInfo(`Assigned PR creator @${creator} to #${number}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [`The pull request was assigned to @${creator} (creator).`],
                    })
                );
                remainingAssignees--; // Reduce the count of required assignees
            } else if (issueCreatorIsTeamMember) {
                const creator = param.issue.creator;
                await this.issueRepository.assignMembersToIssue(
                    param.owner,
                    param.repo,
                    number,
                    [creator],
                    param.tokens.token,
                );
                logDebugInfo(`Assigned Issue creator @${creator} to #${number}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [`The issue was assigned to @${creator} (creator).`],
                    })
                );
                remainingAssignees--; // Reduce the count of required assignees
            }

            /**
             * Exit if no more assignees are needed
             */
            if (remainingAssignees <= 0) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                    })
                );
                return result;
            }

            /**
             * Assign remaining members randomly
             */
            const members = await this.projectRepository.getRandomMembers(
                param.owner,
                remainingAssignees,
                currentMembers,
                param.tokens.token,
            );

            if (members.length === 0) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to assign members to issue, but no one was found.`],
                    })
                );
                return result;
            }

            const membersAdded = await this.issueRepository.assignMembersToIssue(
                param.owner,
                param.repo,
                number,
                members,
                param.tokens.token,
            );

            for (const member of membersAdded) {
                if (members.includes(member)) {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                param.isIssue ? `The issue was assigned to @${member}.` : `The pull request was assigned to @${member}.`,
                            ],
                        })
                    );
                }
            }

            return result;
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Tried to assign members to issue.`],
                    error: error,
                })
            );
        }

        return result;
    }
}
