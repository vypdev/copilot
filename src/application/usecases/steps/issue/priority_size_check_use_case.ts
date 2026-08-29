import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { ProjectDetail } from '../../../../data/model/project_detail';
import type { ProjectBoardCommandPort } from '../../../../application/ports/project_board_command_ports';
import { logDebugInfo, logError } from '../../../ports/logging_ports';

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
    const result: Result[] = [];
    try {
        const priority = typedParam.labels.priorityLabelOnIssue;
        const projects = typedParam.project.getProjects();

        if (!typedParam.labels.priorityLabelOnIssueProcessable || projects.length === 0) {
            return [new Result({ id: taskId, success: true, executed: false })];
        }

        const priorityLabel = priority === typedParam.labels.priorityHigh
            ? 'P0'
            : priority === typedParam.labels.priorityMedium
                ? 'P1'
                : priority === typedParam.labels.priorityLow
                    ? 'P2'
                    : '';

        if (!priorityLabel) {
            return [new Result({ id: taskId, success: true, executed: false })];
        }

        logDebugInfo(`Priority: ${priority}`);
        logDebugInfo(`Github Priority Label: ${priorityLabel}`);

        for (const project of projects) {
            const success = await projectRepository.setTaskPriority(
                project,
                typedParam.owner,
                typedParam.repo,
                contentNumber,
                priorityLabel,
                typedParam.tokens.token,
            );
            if (success) {
                result.push(new Result({
                    id: taskId,
                    success: true,
                    executed: true,
                    steps: [`Priority set to \`${priorityLabel}\` in [${project.title}](${project.publicUrl}).`],
                }));
            }
        }
    } catch (error) {
        logError(error);
        result.push(new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to check the priority of the issue, but there was a problem.'],
            errors: [error?.toString() ?? 'Unknown error'],
        }));
    }
    return result;
}
