import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { ProjectBoardLinkPort } from '../../../ports/project_board_link_ports';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import { logDebugInfo, logError, logInfo, logWarn } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';

export type LinkedContentType = 'issue' | 'pull request';

export interface ProjectContentLinkWorkflowDependencies {
    projectBoardCommandPort: ProjectBoardCommandPort;
    projectBoardLinkPort: ProjectBoardLinkPort;
    eventualConsistencyDelayPort: EventualConsistencyDelayPort;
    resolveContentId: () => Promise<string>;
    contentType: LinkedContentType;
    columnName: string;
    taskId: string;
}

/** Links issue-like content to each configured project and moves it after propagation. */
export async function runProjectContentLinkWorkflow(
    param: Execution,
    dependencies: ProjectContentLinkWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(dependencies.taskId)} Executing ${dependencies.taskId}.`);
    const projects = param.project.getProjects();
    if (projects.length === 0) {
        logDebugInfo(`Link${capitalize(dependencies.contentType)}: no projects configured; skipping.`);
        return [];
    }

    try {
        const contentId = await dependencies.resolveContentId();
        const results: Result[] = [];
        for (const project of projects) {
            const linked = await dependencies.projectBoardLinkPort.linkContentId(
                project,
                contentId,
                param.tokens.token,
            );
            if (!linked) {
                logDebugInfo(
                    `Link${capitalize(dependencies.contentType)}: ${dependencies.contentType} already linked to project "${project.title}" or link failed.`,
                );
                continue;
            }

            await dependencies.eventualConsistencyDelayPort.wait(10_000);
            const moved = await dependencies.projectBoardCommandPort.moveIssueToColumn(
                project,
                param.owner,
                param.repo,
                dependencies.contentType === 'issue' ? param.issue.number : param.pullRequest.number,
                dependencies.columnName,
                param.tokens.token,
            );
            if (moved) {
                results.push(new Result({
                    id: dependencies.taskId,
                    success: true,
                    executed: true,
                    steps: [
                        `The ${dependencies.contentType} was linked to [**${project.title}**](${project.url}) and moved to the column \`${dependencies.columnName}\`.`,
                    ],
                }));
            } else {
                logWarn(
                    `Link${capitalize(dependencies.contentType)}: linked ${dependencies.contentType} to project "${project.title}" but move to column "${dependencies.columnName}" failed.`,
                );
                results.push(moveFailureResult(dependencies, project));
            }
        }
        return results;
    } catch (error) {
        logError(error);
        return [new Result({
            id: dependencies.taskId,
            success: false,
            executed: true,
            steps: [`Tried to link ${dependencies.contentType} to project, but there was a problem.`],
            errors: [error],
        })];
    }
}

function moveFailureResult(
    dependencies: ProjectContentLinkWorkflowDependencies,
    project: { title: string; url: string },
): Result {
    if (dependencies.contentType === 'issue') {
        return new Result({ id: dependencies.taskId, success: true, executed: false, steps: [] });
    }
    return new Result({
        id: dependencies.taskId,
        success: false,
        executed: true,
        steps: [`The ${dependencies.contentType} was linked to [**${project.title}**](${project.url}) but there was an error moving it to the column \`${dependencies.columnName}\`.`],
    });
}

function capitalize(value: string): string {
    return value.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
