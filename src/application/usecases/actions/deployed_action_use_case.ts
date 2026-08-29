import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { BranchMergePort } from "../../../application/ports/branch_merge_ports";
import type { IssueClosurePort } from "../../../application/ports/issue_lifecycle_ports";
import type { IssueLabelsPort } from "../../../application/ports/issue_management_ports";
import { logDebugInfo, logError, logInfo } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";

/**
 * Single action run after a successful deployment (triggered with the "deployed" action and an issue number).
 *
 * Requires the issue to have the "deploy" label and not already have the "deployed" label. Then:
 * 1. Replaces the "deploy" label with "deployed".
 * 2. If a release or hotfix branch is configured: merges it into default and develop (each via PR, waiting for that PR's checks).
 * 3. Closes the issue only when all merges succeed.
 *
 * @see docs/single-actions/deploy-label-and-merge.mdx for the full flow and how merge/check waiting works.
 */
export class DeployedActionUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'DeployedActionUseCase';
    constructor(
        private readonly issueLabelsPort: IssueLabelsPort,
        private readonly issueClosurePort: IssueClosurePort,
        private readonly branchMergePort: BranchMergePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];

        try {
            if (!param.labels.isDeploy) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [
                            `Tried to set label \`${param.labels.deployed}\` but there was no \`${param.labels.deploy}\` label.`,
                        ],
                    })
                );
                return result;
            }

            if (param.labels.isDeployed) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [
                            `Tried to set label \`${param.labels.deployed}\` but it was already set.`,
                        ],
                    })
                );
                return result;
            }

            const labelNames = param.labels.currentIssueLabels.filter(name => name !== param.labels.deploy);
            labelNames.push(param.labels.deployed);

            await this.issueLabelsPort.setLabels(
                param.owner,
                param.repo,
                param.singleAction.issue,
                labelNames,
                param.tokens.token,
            )

            logDebugInfo(`Updated labels on issue #${param.singleAction.issue}:`);
            logDebugInfo(`Labels: ${labelNames}`);

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: [
                        `Label \`${param.labels.deployed}\` added after a success deploy.`,
                    ],
                })
            );

            const mergeResults: Result[] = [];

            if (param.currentConfiguration.releaseBranch) {
                const mergeToDefaultResult = await this.branchMergePort.mergeBranch(
                    param.owner,
                    param.repo,
                    param.currentConfiguration.releaseBranch,
                    param.branches.defaultBranch,
                    param.pullRequest.mergeTimeout,
                    param.tokens.token,
                );
                result.push(...mergeToDefaultResult);
                mergeResults.push(...mergeToDefaultResult);

                const mergeToDevelopResult = await this.branchMergePort.mergeBranch(
                    param.owner,
                    param.repo,
                    param.currentConfiguration.releaseBranch,
                    param.branches.development,
                    param.pullRequest.mergeTimeout,
                    param.tokens.token,
                );
                result.push(...mergeToDevelopResult);
                mergeResults.push(...mergeToDevelopResult);
            } else if (param.currentConfiguration.hotfixBranch) {
                const mergeToDefaultResult = await this.branchMergePort.mergeBranch(
                    param.owner,
                    param.repo,
                    param.currentConfiguration.hotfixBranch,
                    param.branches.defaultBranch,
                    param.pullRequest.mergeTimeout,
                    param.tokens.token,
                );
                result.push(...mergeToDefaultResult);
                mergeResults.push(...mergeToDefaultResult);

                const mergeToDevelopResult = await this.branchMergePort.mergeBranch(
                    param.owner,
                    param.repo,
                    param.branches.defaultBranch,
                    param.branches.development,
                    param.pullRequest.mergeTimeout,
                    param.tokens.token,
                );
                result.push(...mergeToDevelopResult);
                mergeResults.push(...mergeToDevelopResult);
            }

            const mergesAttempted = mergeResults.length > 0;
            const allMergesSucceeded =
                mergesAttempted && mergeResults.every((r) => r.success);

            if (allMergesSucceeded) {
                const issueNumber = Number(param.singleAction.issue);
                const closed = await this.issueClosurePort.closeIssue(
                    param.owner,
                    param.repo,
                    issueNumber,
                    param.tokens.token,
                );
                if (closed) {
                    logDebugInfo(`Issue #${issueNumber} closed after merges to default and develop.`);
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `Issue #${issueNumber} closed after merge to \`${param.branches.defaultBranch}\` and \`${param.branches.development}\`.`,
                            ],
                        })
                    );
                }
            } else {
                if (mergesAttempted) {
                    logDebugInfo(
                        `Skipping issue close: one or more merges failed. Issue #${param.singleAction.issue} remains open.`
                    );
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: false,
                            executed: true,
                            steps: [
                                `Issue #${param.singleAction.issue} was not closed because one or more merge operations failed.`,
                            ],
                        })
                    );
                } else {
                    logDebugInfo(
                        `Skipping issue close: no release or hotfix branch configured. Issue #${param.singleAction.issue} remains open.`
                    );
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: false,
                            executed: true,
                            steps: [
                                `Issue #${param.singleAction.issue} was not closed because no release or hotfix branch was configured (no merge operations were performed).`,
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
                    errors: [error],
                })
            );
        }

        return result;
    }
}
