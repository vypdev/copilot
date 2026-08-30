import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueAssigneePort } from '../../../../application/ports/issue_management_ports';
import type { OrganizationMembersPort } from '../../../../application/ports/organization_members_ports';
import type { PullRequestReviewerPort } from '../../../../application/ports/pull_request_reviewer_ports';
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

export interface AssignReviewersWorkflowDependencies {
    issueRepository: IssueAssigneePort;
    pullRequestRepository: PullRequestReviewerPort;
    projectRepository: OrganizationMembersPort;
}

const TASK_ID = 'AssignReviewersToIssueUseCase';

/** Selects and requests reviewers without coupling the use-case boundary to GitHub. */
export async function runAssignReviewersWorkflow(
    param: Execution,
    dependencies: AssignReviewersWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const desiredReviewersCount = param.pullRequest.desiredReviewersCount;
    const number = param.pullRequest.number;

    try {
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
            currentReviewers.length,
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
    } catch (error) {
        const normalizedError = toPullRequestReviewOperationError(error, 'assign-reviewers');
        logError(normalizedError);
        return [
            new Result({
                id: TASK_ID,
                success: false,
                executed: true,
                steps: ['Tried to assign reviewers to pull request.'],
                errors: [normalizedError],
            }),
        ];
    }
}

async function loadCurrentReviewers(
    param: Execution,
    dependencies: AssignReviewersWorkflowDependencies,
): Promise<string[]> {
    return uniqueLogins(await dependencies.pullRequestRepository.getCurrentReviewers(
        param.owner,
        param.repo,
        param.pullRequest.number,
        param.tokens.token,
    ));
}

async function selectReviewerCandidates(
    param: Execution,
    dependencies: AssignReviewersWorkflowDependencies,
    currentReviewers: string[],
    missingReviewers: number,
): Promise<string[]> {
    const currentAssignees = uniqueLogins(await dependencies.issueRepository.getCurrentAssignees(
        param.owner,
        param.repo,
        param.pullRequest.number,
        param.tokens.token,
    ));
    const excluded = buildReviewerExclusions(param.pullRequest.creator, currentReviewers, currentAssignees);
    const members = await dependencies.projectRepository.getRandomMembers(
        param.owner,
        missingReviewers,
        excluded,
        param.tokens.token,
    );
    return selectEligibleReviewers(members, excluded, missingReviewers);
}

async function requestAndConfirmReviewers(
    param: Execution,
    dependencies: AssignReviewersWorkflowDependencies,
    members: string[],
): Promise<string[]> {
    const reviewersAdded = await dependencies.pullRequestRepository.addReviewersToPullRequest(
        param.owner,
        param.repo,
        param.pullRequest.number,
        members,
        param.tokens.token,
    );
    return selectConfirmedReviewers(members, reviewersAdded);
}

function successResult(): Result {
    return new Result({ id: TASK_ID, success: true, executed: true });
}

function failureResult(step: string): Result {
    return new Result({ id: TASK_ID, success: false, executed: true, steps: [step] });
}
