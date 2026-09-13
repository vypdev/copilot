import { Result } from "../../../../data/model/result";
import type { BoundIssueTypeAssignmentPort } from "../../../../application/ports/issue_management_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { UpdateIssueTypeContext } from '../../issue_workflow_context';

export class UpdateIssueTypeUseCase implements ParamUseCase<UpdateIssueTypeContext, Result[]> {
    taskId: string = 'UpdateIssueTypeUseCase';
    
    constructor(private readonly issueRepository: BoundIssueTypeAssignmentPort) {}

    async invoke(param: UpdateIssueTypeContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []

        try {
            await this.issueRepository.setIssueType(param.issueNumber, param.issueType);
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to update the issue type.');
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to update issue type, but there was a problem.`,
                    ],
                    errors: [semanticError],
                })
            )
        }
        return result;
    }
}
