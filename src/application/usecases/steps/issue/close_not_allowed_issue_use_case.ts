import { Result } from "../../../../data/model/result";
import type { BoundIssueStatePort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { IssueNumberContext } from '../../issue_workflow_context';

export class CloseNotAllowedIssueUseCase implements ParamUseCase<IssueNumberContext, Result[]> {
    taskId: string = 'CloseNotAllowedIssueUseCase';
    
    constructor(private readonly issueRepository: BoundIssueStatePort) {}

    async invoke(param: IssueNumberContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        try {
            const closed = await this.issueRepository.closeIssue(param.issueNumber);
            if (closed) {
                logInfo(`Issue #${param.issueNumber} closed (author not allowed).`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [`#${param.issueNumber} was automatically closed because the author is not a member of the project.`],
                        payload: Object.freeze({ publication: Object.freeze({ kind: 'access-policy' }) }),
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
