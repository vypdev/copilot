import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import { ProjectRepository } from "../../../data/repository/project_repository";
import { logDebugInfo, logError, logInfo } from "../../../utils/logger";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class CheckPriorityPullRequestSizeUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CheckPriorityPullRequestSizeUseCase'; 
    
    private projectRepository = new ProjectRepository();

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        try {
            const priority = param.labels.priorityLabelOnIssue;

            if (!param.labels.priorityLabelOnIssueProcessable || param.project.getProjects().length === 0) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return result;
            }

            let priorityLabel = ``;

            if (priority === param.labels.priorityHigh) {
                priorityLabel = `P0`;
            } else if (priority === param.labels.priorityMedium) {
                priorityLabel = `P1`;
            } else if (priority === param.labels.priorityLow) {
                priorityLabel = `P2`;
            } else {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return result;
            }

            logDebugInfo(`Priority: ${priority}`);
            logDebugInfo(`Github Priority Label: ${priorityLabel}`);

            for (const project of param.project.getProjects()) {
                const success = await this.projectRepository.setTaskPriority(
                    project,
                    param.owner,
                    param.repo,
                    param.pullRequest.number,
                    priorityLabel,
                    param.tokens.token,
                );

                if (success) {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `Priority set to \`${priorityLabel}\` in [${project.title}](${project.publicUrl}).`,
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
                        `Tried to check the priority of the issue, but there was a problem.`,
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
