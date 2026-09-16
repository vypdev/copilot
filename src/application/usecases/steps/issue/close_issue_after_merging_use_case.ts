import { Result } from "../../../../data/model/result";
import type { BoundIssueStatePort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { CloseIssueAfterMergeContext } from '../../issue_workflow_context';
import { parsePositiveSafeInteger } from '../../../../domain/positive_integer_policy';

export class CloseIssueAfterMergingUseCase implements ParamUseCase<CloseIssueAfterMergeContext, Result[]> {
    taskId: string = 'CloseIssueAfterMergingUseCase';
    
    constructor(private readonly issueRepository: BoundIssueStatePort) {}

    async invoke(param: CloseIssueAfterMergeContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        const linkedIssueNumber = parsePositiveSafeInteger(param.issueNumber);
        if (!linkedIssueNumber || linkedIssueNumber === param.pullRequestNumber) {
            logDebugInfo('CloseIssueAfterMerging: no issue was inferred from the pull-request branch; skipping issue closure.');
            return [new Result({
                id: this.taskId,
                success: true,
                executed: false,
                steps: ['No linked issue was found; the pull request was not used to close an issue.'],
            })];
        }
        try {
            const closed = await this.issueRepository.closeIssue(linkedIssueNumber);
            if (closed) {
                logInfo(`Issue #${linkedIssueNumber} closed after merging PR #${param.pullRequestNumber}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `#${linkedIssueNumber} was automatically closed after merging this pull request.`
                        ]
                    })
                );
            } else {
                logDebugInfo(`Issue #${linkedIssueNumber} was already closed or close failed after merge.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                )
            }

        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', `Unable to close issue #${linkedIssueNumber}.`);
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to close issue #${linkedIssueNumber}, but there was a problem.`,
                    ],
                    errors: [semanticError],
                })
            )
        }
        return result
    }
}
