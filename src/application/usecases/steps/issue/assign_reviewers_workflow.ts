import { Result } from '../../../../data/model/result';
import type { BoundIssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { BoundOrganizationMemberSelectionPort } from '../../../../application/ports/organization_members_ports';
import type { BoundPullRequestReviewerPort } from '../../../../application/ports/pull_request_reviewer_ports';
import { toPullRequestReviewOperationError } from '../../../../application/ports/pull_request_review_errors';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import {
    buildReviewerExclusions,
    calculateReviewersStillNeeded,
    selectConfirmedReviewers,
    selectEligibleReviewers,
    uniqueLogins,
} from '../../../policies/reviewer_assignment_policy';
import { toApplicationError } from '../../../errors/application_error';
import type { AssignReviewersContext } from '../../pull_request_workflow_context';

export interface AssignReviewersWorkflowDependencies {
    issueRepository: BoundIssueAssigneePort;
    pullRequestRepository: BoundPullRequestReviewerPort;
    projectRepository: BoundOrganizationMemberSelectionPort;
}

const TASK_ID = 'AssignReviewersToIssueUseCase';

/** Selects and requests reviewers without coupling the use-case boundary to GitHub. */
export async function runAssignReviewersWorkflow(
    param: AssignReviewersContext,
    dependencies: AssignReviewersWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const desiredReviewersCount = param.desiredReviewersCount;
    const number = param.pullRequestNumber;

    try {
        return await executeReviewerAssignment(param, dependencies, desiredReviewersCount, number);
    } catch (error) {
        const normalizedError = toPullRequestReviewOperationError(error, 'assign-reviewers');
        const semanticError = toApplicationError(normalizedError, 'provider.unavailable', 'Unable to assign pull request reviewers.');
        logError(semanticError);
        return [
            new Result({
                id: TASK_ID,
                success: false,
                executed: true,
                steps: ['Tried to assign reviewers to pull request.'],
                errors: [semanticError],
            }),
        ];
    }
}

async function executeReviewerAssignment(
    param: AssignReviewersContext,
    dependencies: AssignReviewersWorkflowDependencies,
    desiredReviewersCount: number,
    number: number,
): Promise<Result[]> {
    logDebugInfo(`#${number} needs ${desiredReviewersCount} reviewers.`);
    if (desiredReviewersCount <= 0 || number <= 0) return [successResult()];

    const currentReviewers = await loadCurrentReviewers(param, dependencies);
    if (currentReviewers.length >= desiredReviewersCount) return [successResult()];

    const missingReviewers = desiredReviewersCount - currentReviewers.length;
    logDebugInfo(`#${number} needs ${missingReviewers} more reviewers.`);
    const members = await selectReviewerCandidates(param, dependencies, currentReviewers, missingReviewers);
    if (members.length === 0) {
        return [failureResult('Tried to assign members as reviewers to pull request, but no one was found.')];
    }

    const confirmedReviewers = await requestAndConfirmReviewers(param, dependencies, members);
    if (confirmedReviewers.length === 0) {
        return [failureResult('Tried to assign members as reviewers to pull request, but no reviewer request was confirmed.')];
    }
    return buildReviewerResults(
        desiredReviewersCount,
        currentReviewers.length,
        missingReviewers,
        confirmedReviewers,
    );
}

function buildReviewerResults(
    desiredReviewersCount: number,
    currentReviewersCount: number,
    missingReviewers: number,
    confirmedReviewers: string[],
): Result[] {
    const results = confirmedReviewers.map(
        (member) => new Result({
            id: TASK_ID,
            success: true,
            executed: true,
            steps: [`@${member} was requested to review the pull request.`],
        }),
    );
    const reviewersStillNeeded = calculateReviewersStillNeeded(
        desiredReviewersCount,
        currentReviewersCount,
        confirmedReviewers.length,
    );
    if (reviewersStillNeeded > 0) {
        results.push(
            failureResult(
                `Confirmed ${confirmedReviewers.length} of ${missingReviewers} required reviewer requests; pull request still needs ${reviewersStillNeeded} ${reviewersStillNeeded === 1 ? 'reviewer' : 'reviewers'}.`,
            ),
        );
    }
    return results;
}

async function loadCurrentReviewers(
    param: AssignReviewersContext,
    dependencies: AssignReviewersWorkflowDependencies,
): Promise<string[]> {
    return uniqueLogins(await dependencies.pullRequestRepository.getCurrentReviewers(param.pullRequestNumber));
}

async function selectReviewerCandidates(
    param: AssignReviewersContext,
    dependencies: AssignReviewersWorkflowDependencies,
    currentReviewers: string[],
    missingReviewers: number,
): Promise<string[]> {
    const currentAssignees = uniqueLogins(await dependencies.issueRepository.getCurrentAssignees(param.pullRequestNumber));
    const excluded = buildReviewerExclusions(param.creator, currentReviewers, currentAssignees);
    const members = await dependencies.projectRepository.getRandomMembers(
        missingReviewers,
        excluded,
    );
    return selectEligibleReviewers(members, excluded, missingReviewers);
}

async function requestAndConfirmReviewers(
    param: AssignReviewersContext,
    dependencies: AssignReviewersWorkflowDependencies,
    members: string[],
): Promise<string[]> {
    const reviewersAdded = await dependencies.pullRequestRepository.addReviewersToPullRequest(
        param.pullRequestNumber,
        members,
    );
    return selectConfirmedReviewers(members, reviewersAdded);
}

function successResult(): Result {
    return new Result({ id: TASK_ID, success: true, executed: true });
}

function failureResult(step: string): Result {
    return new Result({ id: TASK_ID, success: false, executed: true, steps: [step] });
}
