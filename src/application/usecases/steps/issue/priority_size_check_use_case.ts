import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { ProjectDetail } from '../../../../data/model/project_detail';
import type { ProjectBoardCommandPort } from '../../../../application/ports/project_board_command_ports';
import { logDebugInfo, logError } from '../../../ports/logging_ports';
import { resolveGithubPriorityLabel } from './priority_label_policy';

interface PrioritySizeParam {
    labels: {
        priorityLabelOnIssue: string;
        priorityLabelOnIssueProcessable: boolean;
        priorityHigh: string;
        priorityMedium: string;
        priorityLow: string;
    };
    project: { getProjects(): ProjectDetail[] };
    owner: string;
    repo: string;
    issueNumber: number;
    tokens: { token: string };
}

export type ProjectBoardPriorityPort = Pick<ProjectBoardCommandPort, 'setTaskPriority'>;

export async function runPrioritySizeCheck(
    param: Execution | PrioritySizeParam,
    taskId: string,
    contentNumber: number,
    projectRepository: ProjectBoardPriorityPort,
): Promise<Result[]> {
    const typedParam = param as unknown as PrioritySizeParam;
    try {
        return await applyPriorityToProjects(typedParam, taskId, contentNumber, projectRepository);
    } catch (error: unknown) {
        logError(error);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to check the priority of the issue, but there was a problem.'],
            errors: [error?.toString() ?? 'Unknown error'],
        })];
    }
}

async function applyPriorityToProjects(
    param: PrioritySizeParam,
    taskId: string,
    contentNumber: number,
    projectRepository: ProjectBoardPriorityPort,
): Promise<Result[]> {
    const projects = param.project.getProjects();
    const priorityLabel = resolveGithubPriorityLabel(param.labels.priorityLabelOnIssue, param.labels);
    if (!param.labels.priorityLabelOnIssueProcessable || projects.length === 0 || !priorityLabel) {
        return [new Result({ id: taskId, success: true, executed: false })];
    }
    logDebugInfo(`Priority: ${param.labels.priorityLabelOnIssue}`);
    logDebugInfo(`Github Priority Label: ${priorityLabel}`);
    const results: Result[] = [];
    for (const project of projects) {
        if (!await projectRepository.setTaskPriority(
            project,
            param.owner,
            param.repo,
            contentNumber,
            priorityLabel,
            param.tokens.token,
        )) continue;
        results.push(new Result({
            id: taskId,
            success: true,
            executed: true,
            steps: [`Priority set to \`${priorityLabel}\` in [${project.title}](${project.publicUrl}).`],
        }));
    }
    return results;
}
