import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueClosurePort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class CloseNotAllowedIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CloseNotAllowedIssueUseCase';
    
    constructor(private readonly issueRepository: IssueClosurePort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        try {
            const closed = await this.issueRepository.closeIssue(
                param.owner,
                param.repo,
                param.issueNumber,
                param.tokens.token,
            );
            if (closed) {
                logInfo(`Issue #${param.issueNumber} closed (author not allowed). Adding comment.`);
                await this.issueRepository.addComment(
                    param.owner,
                    param.repo,
                    param.issueNumber,
                    `This issue has been closed because the author is not a member of the project. The user may be banned if the fact is repeated.`,
                    param.tokens.token,
                )
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `#${param.issueNumber} was automatically closed because the author is not a member of the project.`
                        ]
                    })
                )
            } else {
                logDebugInfo(`Issue #${param.issueNumber} was already closed or close failed.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                )
            }

        } catch (error) {
            logError(`CloseNotAllowedIssue: failed to close issue #${param.issueNumber}.`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to close issue #${param.issueNumber}, but there was a problem.`,
                    ],
                    error: error,
                })
            )
        }
        return result
    }
}