import { Result } from "../../../../data/model/result";
import type { BoundIssueClosurePort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { CloseIssueAfterMergeContext } from '../../issue_workflow_context';

export class CloseIssueAfterMergingUseCase implements ParamUseCase<CloseIssueAfterMergeContext, Result[]> {
    taskId: string = 'CloseIssueAfterMergingUseCase';
    
    constructor(private readonly issueRepository: BoundIssueClosurePort) {}

    async invoke(param: CloseIssueAfterMergeContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        if (param.issueNumber <= 0) {
            logDebugInfo('CloseIssueAfterMerging: no issue was inferred from the pull-request branch; skipping issue closure.');
            return [new Result({
                id: this.taskId,
                success: true,
                executed: false,
                steps: ['No linked issue was found; the pull request was not used to close an issue.'],
            })];
        }
        try {
            const closed = await this.issueRepository.closeIssue(param.issueNumber);
            if (closed) {
                logInfo(`Issue #${param.issueNumber} closed after merging PR #${param.pullRequestNumber}.`);
                await this.issueRepository.addComment(
                    param.issueNumber,
                    `This issue was closed after merging #${param.pullRequestNumber}.`,
                )
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `#${param.issueNumber} was automatically closed after merging this pull request.`
                        ]
                    })
                );
            } else {
                logDebugInfo(`Issue #${param.issueNumber} was already closed or close failed after merge.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                )
            }

        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', `Unable to close issue #${param.issueNumber}.`);
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to close issue #${param.issueNumber}, but there was a problem.`,
                    ],
                    errors: [semanticError],
                })
            )
        }
        return result
    }
}
