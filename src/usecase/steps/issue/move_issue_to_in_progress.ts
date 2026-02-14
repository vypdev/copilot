import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import { ProjectRepository } from "../../../data/repository/project_repository";
import { logError, logInfo } from "../../../utils/logger";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class MoveIssueToInProgressUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'MoveIssueToInProgressUseCase';
    
    private projectRepository = new ProjectRepository();

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        const columnName = param.project.getProjectColumnIssueInProgress();
        try {
            for (const project of param.project.getProjects()) {
                const success = await this.projectRepository.moveIssueToColumn(
                    project,
                    param.owner,
                    param.repo,
                    param.issueNumber,
                    columnName,
                    param.tokens.token,
                );

                if (success) {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `Moved issue to \`${columnName}\` in [${project.title}](${project.publicUrl}).`,
                            ],
                        })
                    );
                }
            }
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to move the issue to \`${columnName}\`, but there was a problem.`,
                    ],
                    errors: [
                        error?.toString() ?? 'Unknown error',
                    ],
                })
            )
        }
        return result
    }
}
