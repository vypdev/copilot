import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueIdentityQueryPort } from "../../../../application/ports/issue_identity_ports";
import type { ProjectBoardCommandPort } from "../../../../application/ports/project_board_command_ports";
import type { ProjectBoardLinkPort } from "../../../../application/ports/project_board_link_ports";
import type { EventualConsistencyDelayPort } from "../../../../application/ports/eventual_consistency_ports";
import { logDebugInfo, logError, logInfo, logWarn } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class LinkIssueProjectUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'LinkIssueProjectUseCase';
    
    constructor(
        private readonly issueRepository: IssueIdentityQueryPort,
        private readonly projectCommandRepository: ProjectBoardCommandPort,
        private readonly projectLinkRepository: ProjectBoardLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []

        const columnName = param.project.getProjectColumnIssueCreated();
        const projects = param.project.getProjects();
        if (projects.length === 0) {
            logDebugInfo('LinkIssueProject: no projects configured; skipping.');
            return result;
        }
        try {
            for (const project of projects) {
                const issueId = await this.issueRepository.getId(
                    param.owner,
                    param.repo,
                    param.issue.number,
                    param.tokens.token,
                )

                let actionDone = await this.projectLinkRepository.linkContentId(project, issueId, param.tokens.token)
                if (actionDone) {
                    /**
                     * Wait for 10 seconds to ensure the issue is linked to the project
                     */
                    await this.eventualConsistencyDelayPort.wait(10_000);
                    actionDone = await this.projectCommandRepository.moveIssueToColumn(
                        project,
                        param.owner,
                        param.repo,
                        param.issue.number,
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
                                    `The issue was linked to [**${project?.title}**](${project?.url}) and moved to the column \`${columnName}\`.`,
                                ]
                            })
                        )
                    } else {
                        logWarn(`LinkIssueProject: linked issue to project "${project?.title}" but move to column "${columnName}" failed.`);
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: false,
                                steps: []
                            })
                        )
                    }
                } else {
                    logDebugInfo(`LinkIssueProject: issue already linked to project "${project?.title}" or link failed.`);
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
                        `Tried to link issue to project, but there was a problem.`,
                    ],
                    errors: [error],
                })
            )
        }
        return result;
    }
}
