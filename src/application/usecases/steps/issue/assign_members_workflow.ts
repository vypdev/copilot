import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import {
    calculateRemainingAssignees,
    resolveAssigneeTarget,
    resolveCreatorAssignment,
    selectConfirmedAssignees,
} from '../../../policies/assignee_assignment_policy';

export interface AssignMembersWorkflowDependencies {
    issueRepository: IssueAssigneePort;
    projectRepository: OrganizationMembersPort;
}

const TASK_ID = 'AssignMemberToIssueUseCase';

/** Assigns the creator and remaining project members according to the pure assignment policy. */
export async function runAssignMembersWorkflow(
    param: Execution,
    dependencies: AssignMembersWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const target = resolveAssigneeTarget(param);
    const results: Result[] = [];

    try {
        logDebugInfo(`#${target.number} needs ${target.desiredCount} assignees.`);
        if (target.number <= 0) return [assignmentResult(false, 'Issue or pull request number is not available.')];

        const [currentProjectMembers, currentMembers] = await Promise.all([
            dependencies.projectRepository.getAllMembers(param.owner, param.tokens.token),
            dependencies.issueRepository.getCurrentAssignees(
                param.owner,
                param.repo,
                target.number,
                param.tokens.token,
            ),
        ]);
        const creatorAssignment = resolveCreatorAssignment(param, currentProjectMembers, currentMembers);
        if (creatorAssignment) {
            const { login: creator, source } = creatorAssignment;
            await dependencies.issueRepository.assignMembersToIssue(
                param.owner,
                param.repo,
                target.number,
                [creator],
                param.tokens.token,
            );
            logDebugInfo(`Assigned ${source} creator @${creator} to #${target.number}.`);
            results.push(assignmentResult(true, `The ${source} was assigned to @${creator} (creator).`));
        }

        const remainingAssignees = calculateRemainingAssignees(
            target.desiredCount,
            currentMembers.length,
            creatorAssignment !== undefined,
        );
        if (remainingAssignees <= 0) {
            results.push(new Result({ id: TASK_ID, success: true, executed: true }));
            return results;
        }

        const members = await dependencies.projectRepository.getRandomMembers(
            param.owner,
            remainingAssignees,
            currentMembers,
            param.tokens.token,
        );
        if (members.length === 0) {
            results.push(assignmentResult(false, 'Tried to assign members to issue, but no one was found.'));
            return results;
        }

        const membersAdded = await dependencies.issueRepository.assignMembersToIssue(
            param.owner,
            param.repo,
            target.number,
            members,
            param.tokens.token,
        );
        results.push(
            ...selectConfirmedAssignees(members, membersAdded).map((member) => assignmentResult(
                true,
                `${param.isIssue ? 'The issue' : 'The pull request'} was assigned to @${member}.`,
            )),
        );
        return results;
    } catch (error) {
        logError(error);
        results.push(
            new Result({
                id: TASK_ID,
                success: false,
                executed: true,
                steps: ['Tried to assign members to issue.'],
                errors: [error],
            }),
        );
        return results;
    }
}

function assignmentResult(success: boolean, step?: string): Result {
    return new Result({
        id: TASK_ID,
        success,
        executed: true,
        steps: step ? [step] : [],
    });
}
