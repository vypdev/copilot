import { Result } from "../../../../data/model/result";
import type { BoundIssueClosurePort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { IssueNumberContext } from '../../issue_workflow_context';

export class CloseNotAllowedIssueUseCase implements ParamUseCase<IssueNumberContext, Result[]> {
    taskId: string = 'CloseNotAllowedIssueUseCase';
    
    constructor(private readonly issueRepository: BoundIssueClosurePort) {}

    async invoke(param: IssueNumberContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        try {
            const closed = await this.issueRepository.closeIssue(param.issueNumber);
            if (closed) {
                logInfo(`Issue #${param.issueNumber} closed (author not allowed). Adding comment.`);
                await this.issueRepository.addComment(
                    param.issueNumber,
                    `This issue has been closed because the author is not a member of the project. The user may be banned if the fact is repeated.`,
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
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to close the unauthorized issue.');
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
