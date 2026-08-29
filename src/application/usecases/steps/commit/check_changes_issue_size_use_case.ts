import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchChangeSizePort } from "../../../ports/branch_change_ports";
import { ProjectBoardCommandPort } from "../../../ports/project_board_command_ports";
import type { IssueLabelsPort } from "../../../ports/issue_management_ports";
import type { PullRequestBranchQueryPort } from "../../../ports/pull_request_branch_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { updateIssueAndRelatedPullRequests } from "./update_change_size_labels";
import { ParamUseCase } from "../../base/param_usecase";

export class CheckChangesIssueSizeUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CheckChangesIssueSizeUseCase';

    constructor(
        private readonly projectBoardCommandPort: ProjectBoardCommandPort,
        private readonly issueRepository: IssueLabelsPort,
        private readonly pullRequestRepository: PullRequestBranchQueryPort,
        private readonly branchChangeSizePort: BranchChangeSizePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];
        try {
            const baseBranch =
                param.currentConfiguration.parentBranch ??
                param.branches.development ??
                'develop';
            if (!baseBranch) {
                logDebugInfo(`Parent branch could not be determined.`);
                return result;
            }

            const headBranch = param.commit.branch;

            const { size, githubSize, reason } = await this.branchChangeSizePort.getSizeCategoryAndReason(
                param.owner,
                param.repo,
                headBranch,
                baseBranch,
                param.sizeThresholds,
                param.labels,
                param.tokens.token,
            );

            logDebugInfo(`Size: ${size}`);
            logDebugInfo(`Github Size: ${githubSize}`);
            logDebugInfo(`Reason: ${reason}`);
            logDebugInfo(`Labels: ${param.labels.sizedLabelOnIssue}`);

            if (param.labels.sizedLabelOnIssue !== size) {
                const update = await updateIssueAndRelatedPullRequests({
                    owner: param.owner,
                    repository: param.repo,
                    issueNumber: param.issueNumber,
                    headBranch,
                    size,
                    githubSize,
                    currentIssueLabels: param.labels.currentIssueLabels,
                    sizeLabels: param.labels.sizeLabels,
                    projects: param.project.getProjects(),
                    token: param.tokens.token,
                }, {
                    issueLabelsPort: this.issueRepository,
                    projectBoardCommandPort: this.projectBoardCommandPort,
                    pullRequestBranchQueryPort: this.pullRequestRepository,
                });

                logDebugInfo(`Updated labels on issue #${param.issueNumber}:`);
                logDebugInfo(`Labels: ${update.issueLabelNames}`);

                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `${reason}, so the issue was resized to ${size}.` +
                                (update.openPullRequestNumbers.length > 0 ? ` Same label applied to ${update.openPullRequestNumbers.length} open PR(s).` : ''),
                        ],
                    }),
                );
            } else {
                logDebugInfo(`The issue is already at the correct size.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                    }),
                );
            }
        } catch (error) {
            logError(`CheckChangesIssueSize: failed for issue #${param.issueNumber}.`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to check the size of the changes, but there was a problem.`,
                    ],
                    errors: [error?.toString() ?? 'Unknown error'],
                }),
            );
        }
        return result;
    }
}
