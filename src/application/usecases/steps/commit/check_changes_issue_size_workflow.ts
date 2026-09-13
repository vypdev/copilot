import { Result } from '../../../../data/model/result';
import type { BoundBranchChangeSizePort } from '../../../ports/branch_change_ports';
import type { BoundProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { BoundIssueLabelsPort } from '../../../ports/issue_management_ports';
import type { BoundPullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
import type { ChangeSizeContext } from '../../push_single_action_contexts';
import { logDebugInfo, logError } from '../../../ports/logging_ports';
import { updateIssueAndRelatedPullRequests } from './update_change_size_labels';
import { toApplicationError } from '../../../errors/application_error';

export interface CheckChangesIssueSizeDependencies {
    projectBoardCommandPort: BoundProjectBoardCommandPort;
    issueRepository: BoundIssueLabelsPort;
    pullRequestRepository: BoundPullRequestBranchQueryPort;
    branchChangeSizePort: BoundBranchChangeSizePort;
}

export async function runCheckChangesIssueSize(param: ChangeSizeContext, taskId: string, dependencies: CheckChangesIssueSizeDependencies): Promise<Result[]> {
    try {
        const baseBranch = param.baseBranch;
        if (!baseBranch) {
            logDebugInfo('Parent branch could not be determined.');
            return [];
        }
        const headBranch = param.headBranch;
        const size = await dependencies.branchChangeSizePort.getSizeCategoryAndReason(
            headBranch, baseBranch, param.thresholds, param.labels,
        );
        logSize(size.size, size.githubSize, size.reason, param.currentSize);
        if (param.currentSize === size.size) {
            logDebugInfo('The issue is already at the correct size.');
            return [new Result({ id: taskId, success: true, executed: true })];
        }
        const update = await updateIssueAndRelatedPullRequests({
            issueNumber: param.issueNumber,
            headBranch,
            size: size.size,
            githubSize: size.githubSize,
            currentIssueLabels: param.currentIssueLabels,
            sizeLabels: Object.values(param.labels),
            projects: param.projects,
        }, {
            issueLabelsPort: dependencies.issueRepository,
            projectBoardCommandPort: dependencies.projectBoardCommandPort,
            pullRequestBranchQueryPort: dependencies.pullRequestRepository,
        });
        logDebugInfo(`Updated labels on issue #${param.issueNumber}:`);
        logDebugInfo(`Labels: ${update.issueLabelNames}`);
        return [new Result({
            id: taskId,
            success: true,
            executed: true,
            steps: [`${size.reason}, so the issue was resized to ${size.size}.` + (update.openPullRequestNumbers.length > 0 ? ` Same label applied to ${update.openPullRequestNumbers.length} open PR(s).` : '')],
        })];
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to check the size of the changes.');
        logError(semanticError);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to check the size of the changes, but there was a problem.'],
            errors: [semanticError],
        })];
    }
}

function logSize(size: string, githubSize: string, reason: string, currentLabel: string | undefined): void {
    logDebugInfo(`Size: ${size}`);
    logDebugInfo(`Github Size: ${githubSize}`);
    logDebugInfo(`Reason: ${reason}`);
    logDebugInfo(`Labels: ${currentLabel}`);
}
