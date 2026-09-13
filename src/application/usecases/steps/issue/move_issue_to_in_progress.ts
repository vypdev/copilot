import { Result } from "../../../../data/model/result";
import type { BoundProjectBoardCommandPort } from "../../../../application/ports/project_board_command_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { MoveIssueToInProgressContext } from '../../issue_workflow_context';

export class MoveIssueToInProgressUseCase implements ParamUseCase<MoveIssueToInProgressContext, Result[]> {
    taskId: string = 'MoveIssueToInProgressUseCase';
    
    constructor(private readonly projectRepository: BoundProjectBoardCommandPort) {}

    async invoke(param: MoveIssueToInProgressContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        const columnName = param.columnName;
        try {
            for (const project of param.projects) {
                const success = await this.projectRepository.moveIssueToColumn(
                    project,
                    param.issueNumber,
                    columnName,
                );

                if (success) {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `Moved issue to \`${columnName}\` in [${project.title}](${project.url}).`,
                            ],
                        })
                    );
                }
            }
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to move the issue to the in-progress column.');
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to move the issue to \`${columnName}\`, but there was a problem.`,
                    ],
                    errors: [semanticError],
                })
            )
        }
        return result
    }
}
