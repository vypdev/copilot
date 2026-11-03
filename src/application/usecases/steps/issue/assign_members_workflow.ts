import { Result } from '../../../../data/model/result';
import type { BoundIssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { BoundOrganizationMemberSelectionPort } from '../../../../application/ports/organization_members_ports';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import {
    calculateRemainingAssignees,
    resolveAssigneeTarget,
    resolveCreatorAssignment,
    selectConfirmedAssignees,
} from '../../../policies/assignee_assignment_policy';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
import { issueAssignmentFailure } from '../../../errors/issue_assignment_failure';
import type { IssueAssignmentDiagnostic } from '../../../../domain/issue_assignment_diagnostic';
import type { AssignmentContext } from '../../issue_workflow_context';

export interface AssignMembersWorkflowDependencies {
    issueRepository: BoundIssueAssigneePort;
    projectRepository: BoundOrganizationMemberSelectionPort;
}

const TASK_ID = 'AssignMemberToIssueUseCase';

/** Assigns the creator and remaining project members according to the pure assignment policy. */
export async function runAssignMembersWorkflow(
    param: AssignmentContext,
    dependencies: AssignMembersWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const target = resolveAssigneeTarget(param);
    const results: Result[] = [];
    let stage: IssueAssignmentDiagnostic['stage'] = 'read-assignees';
    let assigneeRead: IssueAssignmentDiagnostic['assigneeRead'] = 'unavailable';
    let mutation: IssueAssignmentDiagnostic['mutation'] = 'not-attempted';
    let observedAssignees = 0;
    const confirmed: string[] = [];

    try {
        logDebugInfo(`#${target.number} needs ${target.desiredCount} assignees.`);
        if (target.desiredCount <= 0) return [new Result({ id: TASK_ID, success: true, executed: false })];
        if (target.number <= 0) return [assignmentResult(false, 'Issue or pull request number is not available.')];

        const currentMembers = await dependencies.issueRepository.getCurrentAssignees(target.number);
        observedAssignees = new Set(currentMembers.map(member => member.toLowerCase())).size;
        assigneeRead = 'verified';
        if (observedAssignees >= target.desiredCount) return [new Result({ id: TASK_ID, success: true, executed: true })];
        stage = 'lookup-members';
        const currentProjectMembers = await dependencies.projectRepository.getAllMembers();
        const creatorAssignment = resolveCreatorAssignment(param, currentProjectMembers, currentMembers);
        if (creatorAssignment) {
            const { login: creator, source } = creatorAssignment;
            stage = 'assign-creator';
            mutation = 'unverified';
            const added = await dependencies.issueRepository.assignMembersToIssue(target.number, [creator]);
            if (selectConfirmedAssignees([creator], added).length === 0) {
                throw new ApplicationError('provider.contract-invalid', 'The creator assignment was not confirmed.');
            }
            confirmed.push(creator);
            mutation = 'verified';
            logDebugInfo(`Assigned ${source} creator @${creator} to #${target.number}.`);
            results.push(assignmentResult(true, `The ${source} was assigned to @${creator} (creator).`));
        }

        const remainingAssignees = calculateRemainingAssignees(
            target.desiredCount,
            observedAssignees,
            creatorAssignment !== undefined,
        );
        if (remainingAssignees <= 0) {
            results.push(new Result({ id: TASK_ID, success: true, executed: true }));
            return results;
        }

        stage = 'select-members';
        const members = await dependencies.projectRepository.getRandomMembers(remainingAssignees, [...currentMembers, ...confirmed]);
        if (members.length === 0) {
            results.push(assignmentResult(false, 'Tried to assign members to issue, but no one was found.'));
            return results;
        }

        stage = 'assign-members';
        mutation = 'unverified';
        const membersAdded = await dependencies.issueRepository.assignMembersToIssue(target.number, members);
        const verifiedMembers = selectConfirmedAssignees(members, membersAdded);
        confirmed.push(...verifiedMembers);
        results.push(
            ...verifiedMembers.map((member) => assignmentResult(
                true,
              `The ${param.target} was assigned to @${member}.`,
            )),
        );
        if (verifiedMembers.length !== members.length) {
            throw new ApplicationError('provider.contract-invalid', 'Some requested assignments were not confirmed.');
        }
        mutation = 'verified';
        return results;
    } catch (error) {
        const semanticError = issueAssignmentFailure(toApplicationError(error, 'unexpected', 'Automatic member assignment stopped.'), {
            targetNumber: target.number, desiredCount: target.desiredCount, stage, assigneeRead, mutation,
            observedAssignees: assigneeRead === 'verified' ? observedAssignees : 'unavailable', confirmedAssignments: confirmed.length,
            remainingAssignments: assigneeRead === 'verified' ? Math.max(0, target.desiredCount - observedAssignees - confirmed.length) : 'unavailable',
        });
        logError(semanticError);
        results.push(
            new Result({
                id: TASK_ID,
                success: false,
                executed: true,
                steps: ['Tried to assign members to issue.'],
                errors: [semanticError],
            }),
        );
        return results;
    }
}

function assignmentResult(success: boolean, step: string): Result {
    return new Result({
        id: TASK_ID,
        success,
        executed: true,
        steps: [step],
    });
}
