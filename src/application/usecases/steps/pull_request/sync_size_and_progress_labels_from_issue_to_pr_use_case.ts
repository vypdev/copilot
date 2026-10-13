import { Result } from "../../../../data/model/result";
import type { BoundIssueLabelsPort } from "../../../ports/issue_management_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { mergeSizeAndProgressLabels, selectSizeAndProgressLabels } from './sync_size_and_progress_labels_policy';
import { toApplicationError } from '../../../errors/application_error';
import type { SyncPullRequestLabelsContext } from '../../pull_request_workflow_context';
import { parsePositiveSafeInteger } from '../../../../domain/positive_integer_policy';
import type { BoundProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { BoundProjectBoardMembershipQueryPort } from '../../../ports/project_board_query_ports';
import { ApplicationError } from '../../../errors/application_error';

/**
 * Copies size and progress labels from the linked issue to the PR.
 * Used when a PR is opened so it gets the same size/progress as the issue (corner case:
 * no push has run yet, so CommitUseCase has not updated the PR).
 */
export class SyncSizeAndProgressLabelsFromIssueToPrUseCase implements ParamUseCase<SyncPullRequestLabelsContext, Result[]> {
    taskId: string = 'SyncSizeAndProgressLabelsFromIssueToPrUseCase';

    constructor(private readonly issueLabelsPort: BoundIssueLabelsPort,
        private readonly projectSizes?: Pick<BoundProjectBoardCommandPort, 'setTaskSize'>,
        private readonly membership?: BoundProjectBoardMembershipQueryPort) {}

    async invoke(param: SyncPullRequestLabelsContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];
        try {
            const linkedIssueNumber = parsePositiveSafeInteger(param.issueNumber);
            if (!linkedIssueNumber || linkedIssueNumber === param.pullRequestNumber) {
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

            const issueLabels = await this.issueLabelsPort.getLabels(linkedIssueNumber);
            const sizes = issueLabels.filter(label => Object.prototype.hasOwnProperty.call(param.projectSizeByLabel, label));
            if (sizes.length > 1) throw new ApplicationError('validation.invalid-input', 'The linked issue has ambiguous configured size labels.');
            const sizeAndProgressFromIssue = selectSizeAndProgressLabels(issueLabels, param.sizeLabels);
            if (sizeAndProgressFromIssue.length === 0) {
                logDebugInfo(`Issue #${linkedIssueNumber} has no size or progress labels. Nothing to sync.`);
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

            const prNumber = param.pullRequestNumber;
            const prLabels = await this.issueLabelsPort.getLabels(prNumber);
            const nextPrLabels = mergeSizeAndProgressLabels(prLabels, sizeAndProgressFromIssue, param.sizeLabels);

            if (prLabels.length !== nextPrLabels.length || prLabels.some(label => !nextPrLabels.includes(label))) {
                await this.issueLabelsPort.setLabels(prNumber, nextPrLabels);
            }
            if (sizes.length === 1 && param.projects.length > 0) {
                if (!this.projectSizes || !this.membership) throw new ApplicationError('provider.unavailable', 'PR Project size reconciliation authority is unavailable.');
                for (const project of param.projects) {
                    if (!await this.membership.isContentLinked(project, prNumber)) {
                        throw new ApplicationError('provider.unavailable', 'The PR Project link remains unverified after lifecycle linking.');
                    }
                    if (!await this.projectSizes.setTaskSize(project, prNumber, param.projectSizeByLabel[sizes[0]])) {
                        throw new ApplicationError('provider.unavailable', 'The PR Project Size field could not be reconciled.');
                    }
                }
            }
            logDebugInfo(`Synced size/progress labels from issue #${linkedIssueNumber} to PR #${prNumber}: ${sizeAndProgressFromIssue.join(', ')}`);

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: [],
                }),
            );
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to synchronize size and progress labels.');
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Failed to sync size/progress labels from issue to PR.`],
                    errors: [semanticError],
                }),
            );
        }
        return result;
    }
}
