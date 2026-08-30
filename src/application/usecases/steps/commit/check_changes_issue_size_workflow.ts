import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { BranchChangeSizePort } from '../../../ports/branch_change_ports';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { IssueLabelsPort } from '../../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
import { logDebugInfo, logError } from '../../../ports/logging_ports';
import { updateIssueAndRelatedPullRequests } from './update_change_size_labels';

export interface CheckChangesIssueSizeDependencies {
    projectBoardCommandPort: ProjectBoardCommandPort;
    issueRepository: IssueLabelsPort;
    pullRequestRepository: PullRequestBranchQueryPort;
    branchChangeSizePort: BranchChangeSizePort;
}

export async function runCheckChangesIssueSize(param: Execution, taskId: string, dependencies: CheckChangesIssueSizeDependencies): Promise<Result[]> {
    try {
        const baseBranch = param.currentConfiguration.parentBranch ?? param.branches.development ?? 'develop';
        if (!baseBranch) {
            logDebugInfo('Parent branch could not be determined.');
            return [];
        }
        const headBranch = param.commit.branch;
        const size = await dependencies.branchChangeSizePort.getSizeCategoryAndReason(
            param.owner, param.repo, headBranch, baseBranch, param.sizeThresholds, param.labels, param.tokens.token,
        );
        logSize(size.size, size.githubSize, size.reason, param.labels.sizedLabelOnIssue);
        if (param.labels.sizedLabelOnIssue === size.size) {
            logDebugInfo('The issue is already at the correct size.');
            return [new Result({ id: taskId, success: true, executed: true })];
        }
        const update = await updateIssueAndRelatedPullRequests({
            owner: param.owner,
            repository: param.repo,
            issueNumber: param.issueNumber,
            headBranch,
            size: size.size,
            githubSize: size.githubSize,
            currentIssueLabels: param.labels.currentIssueLabels,
            sizeLabels: param.labels.sizeLabels,
            projects: param.project.getProjects(),
            token: param.tokens.token,
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
        logError(`CheckChangesIssueSize: failed for issue #${param.issueNumber}.`, error instanceof Error ? { stack: error.stack } : undefined);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to check the size of the changes, but there was a problem.'],
            errors: [error?.toString() ?? 'Unknown error'],
        })];
    }
}

function logSize(size: string, githubSize: string, reason: string, currentLabel: string | undefined): void {
    logDebugInfo(`Size: ${size}`);
    logDebugInfo(`Github Size: ${githubSize}`);
    logDebugInfo(`Reason: ${reason}`);
    logDebugInfo(`Labels: ${currentLabel}`);
}
