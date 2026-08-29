import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueAssigneePort } from "../../../../application/ports/issue_management_ports";
import type { OrganizationMembersPort } from "../../../../application/ports/organization_members_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import {
  calculateRemainingAssignees,
  resolveAssigneeTarget,
  resolveCreatorAssignment,
  selectConfirmedAssignees,
} from "../../../policies/assignee_assignment_policy";
import { ParamUseCase } from "../../base/param_usecase";

function assignmentResult(taskId: string, success: boolean, step?: string): Result {
  return new Result({
    id: taskId,
    success,
    executed: true,
    steps: step ? [step] : [],
  });
}

export class AssignMemberToIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'AssignMemberToIssueUseCase';
    
    constructor(private readonly issueRepository: IssueAssigneePort, private readonly projectRepository: OrganizationMembersPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const target = resolveAssigneeTarget(param);
        const result: Result[] = [];

        try {
            logDebugInfo(`#${target.number} needs ${target.desiredCount} assignees.`);

            const currentProjectMembers = await this.projectRepository.getAllMembers(
                param.owner,
                param.tokens.token,
            )

            const currentMembers = await this.issueRepository.getCurrentAssignees(
                param.owner,
                param.repo,
                target.number,
                param.tokens.token,
            );

            const creatorAssignment = resolveCreatorAssignment(param, currentProjectMembers, currentMembers);
            if (creatorAssignment) {
                const { login: creator, source } = creatorAssignment;
                await this.issueRepository.assignMembersToIssue(
                    param.owner,
                    param.repo,
                    target.number,
                    [creator],
                    param.tokens.token,
                );
                logDebugInfo(`Assigned ${source} creator @${creator} to #${target.number}.`);
                result.push(assignmentResult(
                    this.taskId,
                    true,
                    `The ${source} was assigned to @${creator} (creator).`,
                ));
            }

            const remainingAssignees = calculateRemainingAssignees(
                target.desiredCount,
                currentMembers.length,
                creatorAssignment !== undefined,
            );

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
                target.number,
                members,
                param.tokens.token,
            );

            for (const member of selectConfirmedAssignees(members, membersAdded)) {
                result.push(assignmentResult(
                    this.taskId,
                    true,
                    `${param.isIssue ? 'The issue' : 'The pull request'} was assigned to @${member}.`,
                ));
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
                    errors: [error],
                })
            );
        }

        return result;
    }
}
