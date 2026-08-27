import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueTypeAssignmentPort } from "../../../../application/ports/issue_management_ports";
import { logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class UpdateIssueTypeUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'UpdateIssueTypeUseCase';
    
    constructor(private readonly issueRepository: IssueTypeAssignmentPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []

        try {
            await this.issueRepository.setIssueType(
                param.owner,
                param.repo,
                param.issueNumber,
                param.labels,
                param.issueTypes,
                param.tokens.token,
            );
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to update issue type, but there was a problem.`,
                    ],
                    error: error,
                })
            )
        }
        return result;
    }
}