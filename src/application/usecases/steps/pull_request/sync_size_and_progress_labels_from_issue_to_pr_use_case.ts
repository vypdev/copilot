import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueLabelsPort } from "../../../ports/issue_management_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { mergeSizeAndProgressLabels, selectSizeAndProgressLabels } from './sync_size_and_progress_labels_policy';

/**
 * Copies size and progress labels from the linked issue to the PR.
 * Used when a PR is opened so it gets the same size/progress as the issue (corner case:
 * no push has run yet, so CommitUseCase has not updated the PR).
 */
export class SyncSizeAndProgressLabelsFromIssueToPrUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'SyncSizeAndProgressLabelsFromIssueToPrUseCase';

    constructor(private readonly issueLabelsPort: IssueLabelsPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];
        try {
            if (param.issueNumber === -1) {
                logDebugInfo('No issue linked to this PR. Skipping sync of size/progress labels.');
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                        steps: ['No issue linked; size/progress labels not synced.'],
                    }),
                );
                return result;
            }

            const issueLabels = await this.issueLabelsPort.getLabels(
                param.owner,
                param.repo,
                param.issueNumber,
                param.tokens.token,
            );
            const sizeAndProgressFromIssue = selectSizeAndProgressLabels(issueLabels, param.labels.sizeLabels);
            if (sizeAndProgressFromIssue.length === 0) {
                logDebugInfo(`Issue #${param.issueNumber} has no size or progress labels. Nothing to sync.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: ['Issue has no size/progress labels to sync.'],
                    }),
                );
                return result;
            }

            const prNumber = param.pullRequest.number;
            const prLabels = await this.issueLabelsPort.getLabels(
                param.owner,
                param.repo,
                prNumber,
                param.tokens.token,
            );
            const nextPrLabels = mergeSizeAndProgressLabels(prLabels, sizeAndProgressFromIssue, param.labels.sizeLabels);

            await this.issueLabelsPort.setLabels(
                param.owner,
                param.repo,
                prNumber,
                nextPrLabels,
                param.tokens.token,
            );
            logDebugInfo(`Synced size/progress labels from issue #${param.issueNumber} to PR #${prNumber}: ${sizeAndProgressFromIssue.join(', ')}`);

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: [],
                }),
            );
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Failed to sync size/progress labels from issue to PR.`],
                    errors: [error?.toString() ?? 'Unknown error'],
                }),
            );
        }
        return result;
    }
}
