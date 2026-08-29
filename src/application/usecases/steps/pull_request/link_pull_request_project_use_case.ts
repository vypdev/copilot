import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { ProjectBoardCommandPort } from "../../../ports/project_board_command_ports";
import type { ProjectBoardLinkPort } from "../../../ports/project_board_link_ports";
import type { EventualConsistencyDelayPort } from "../../../ports/eventual_consistency_ports";
import { logDebugInfo, logError, logInfo, logWarn } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class LinkPullRequestProjectUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'LinkPullRequestProjectUseCase';
    
    constructor(
        private readonly projectBoardCommandPort: ProjectBoardCommandPort,
        private readonly projectBoardLinkPort: ProjectBoardLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []

        const columnName = param.project.getProjectColumnPullRequestCreated();
        const projects = param.project.getProjects();
        if (projects.length === 0) {
            logDebugInfo('LinkPullRequestProject: no projects configured; skipping.');
            return result;
        }
        try {
            for (const project of projects) {
                let actionDone = await this.projectBoardLinkPort.linkContentId(
                    project,
                    param.pullRequest.id,
                    param.tokens.token
                )

                if (actionDone) {
                    /**
                     * Wait for 10 seconds to ensure the pull request is linked to the project
                     */
                    await this.eventualConsistencyDelayPort.wait(10_000);
                    actionDone = await this.projectBoardCommandPort.moveIssueToColumn(
                        project,
                        param.owner,
                        param.repo,
                        param.pullRequest.number,
                        columnName,
                        param.tokens.token,
                    )

                    if (actionDone) {
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: true,
                                steps: [
                                    `The pull request was linked to [**${project?.title}**](${project?.url}) and moved to the column \`${columnName}\`.`,
                                ],
                            })
                        )
                    } else {
                        logWarn(`LinkPullRequestProject: linked PR to project "${project?.title}" but move to column "${columnName}" failed.`);
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: false,
                                executed: true,
                                steps: [
                                    `The pull request was linked to [**${project?.title}**](${project?.url}) but there was an error moving it to the column \`${columnName}\`.`,
                                ],
                            })
                        )
                    }
                } else {
                    logDebugInfo(`LinkPullRequestProject: PR already linked to project "${project?.title}" or link failed.`);
                }
            }
            return result;
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to link pull request to project, but there was a problem.`,
                    ],
                    errors: [error],
                })
            )
        }
        return result;
    }
}
