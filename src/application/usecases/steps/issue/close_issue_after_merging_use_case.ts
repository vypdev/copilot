import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueClosurePort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";

export class CloseIssueAfterMergingUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CloseIssueAfterMergingUseCase';
    
    constructor(private readonly issueRepository: IssueClosurePort) {}

    async invoke(param: Execution): Promise<Result[]> {
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
            const closed = await this.issueRepository.closeIssue(
                param.owner,
                param.repo,
                param.issueNumber,
                param.tokens.token,
            );
            if (closed) {
                logInfo(`Issue #${param.issueNumber} closed after merging PR #${param.pullRequest.number}.`);
                await this.issueRepository.addComment(
                    param.owner,
                    param.repo,
                    param.issueNumber,
                    `This issue was closed after merging #${param.pullRequest.number}.`,
                    param.tokens.token,
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
