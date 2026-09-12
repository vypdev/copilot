import { Result } from '../../../../data/model/result';
import type {
    BoundProjectContentPort,
    ProjectReference,
} from '../../../ports/project_board_link_ports';
import { logDebugInfo, logError, logInfo, logWarn } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { toApplicationError } from '../../../errors/application_error';

export type LinkedContentType = 'issue' | 'pull request';

export interface ProjectContentLinkContext {
    readonly contentType: LinkedContentType;
    readonly contentNumber: number;
    readonly contentId?: string;
    readonly columnName: string;
    readonly projects: readonly ProjectReference[];
}

export interface ProjectContentLinkSource {
    readonly project: {
        getProjects(): readonly ProjectReference[];
        getProjectColumnIssueCreated(): string;
        getProjectColumnPullRequestCreated(): string;
    };
    readonly issue: { readonly number: number };
    readonly pullRequest: { readonly number: number; readonly id: string };
}

export function projectIssueContentLinkContext(source: ProjectContentLinkSource): ProjectContentLinkContext {
    return projectContext(
        source,
        'issue',
        source.issue.number,
        source.project.getProjectColumnIssueCreated(),
    );
}

export function projectPullRequestContentLinkContext(source: ProjectContentLinkSource): ProjectContentLinkContext {
    return projectContext(
        source,
        'pull request',
        source.pullRequest.number,
        source.project.getProjectColumnPullRequestCreated(),
        source.pullRequest.id,
    );
}

/** Links issue-like content to each configured project and moves it after propagation. */
export async function runProjectContentLinkWorkflow(
    param: ProjectContentLinkContext,
    taskId: string,
    port: BoundProjectContentPort,
    waitForPropagation: () => Promise<void>,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId}.`);
    if (param.projects.length === 0) {
        logDebugInfo(`Link${capitalize(param.contentType)}: no projects configured; skipping.`);
        return [];
    }

    try {
        const contentId = param.contentId ?? await port.resolveIssueContentId(param.contentNumber);
        const results: Result[] = [];
        for (const project of param.projects) {
            const linked = await port.linkContentId(project, contentId);
            if (!linked) {
                logDebugInfo(
                    `Link${capitalize(param.contentType)}: ${param.contentType} already linked to project "${project.title}" or link failed.`,
                );
                continue;
            }

            await waitForPropagation();
            const moved = await port.moveContent(project, param.contentNumber, param.columnName);
            if (moved) {
                results.push(new Result({
                    id: taskId,
                    success: true,
                    executed: true,
                    steps: [
                        `The ${param.contentType} was linked to [**${project.title}**](${project.url}) and moved to the column \`${param.columnName}\`.`,
                    ],
                }));
            } else {
                logWarn(
                    `Link${capitalize(param.contentType)}: linked ${param.contentType} to project "${project.title}" but move to column "${param.columnName}" failed.`,
                );
                results.push(moveFailureResult(param, taskId, project));
            }
        }
        return results;
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', `Unable to link the ${param.contentType} to the project.`);
        logError(semanticError);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: [`Tried to link ${param.contentType} to project, but there was a problem.`],
            errors: [semanticError],
        })];
    }
}

function projectContext(
    source: ProjectContentLinkSource,
    contentType: LinkedContentType,
    contentNumber: number,
    columnName: string,
    contentId?: string,
): ProjectContentLinkContext {
    return Object.freeze({
        contentType,
        contentNumber,
        ...(contentId ? { contentId } : {}),
        columnName,
        projects: Object.freeze(source.project.getProjects().map((project) => Object.freeze({
            id: project.id,
            title: project.title,
            type: project.type,
            owner: project.owner,
            url: project.url,
            number: project.number,
        }))),
    });
}

function moveFailureResult(
    context: ProjectContentLinkContext,
    taskId: string,
    project: ProjectReference,
): Result {
    if (context.contentType === 'issue') {
        return new Result({ id: taskId, success: true, executed: false, steps: [] });
    }
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: [`The ${context.contentType} was linked to [**${project.title}**](${project.url}) but there was an error moving it to the column \`${context.columnName}\`.`],
    });
}

function capitalize(value: string): string {
    return value.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
