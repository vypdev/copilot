import { Result } from '../../../../data/model/result';
import type { BoundProjectBoardCommandPort } from '../../../../application/ports/project_board_command_ports';
import { logDebugInfo, logError } from '../../../ports/logging_ports';
import { resolveGithubPriorityLabel } from './priority_label_policy';
import { toApplicationError } from '../../../errors/application_error';
import type { PrioritySizeContext } from '../../issue_workflow_context';

export type ProjectBoardPriorityPort = Pick<BoundProjectBoardCommandPort, 'setTaskPriority'>;

export async function runPrioritySizeCheck(
    param: PrioritySizeContext,
    taskId: string,
    projectRepository: ProjectBoardPriorityPort,
): Promise<Result[]> {
    try {
        return await applyPriorityToProjects(param, taskId, projectRepository);
    } catch (error: unknown) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to apply the issue priority to configured projects.');
        logError(semanticError);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to check the priority of the issue, but there was a problem.'],
            errors: [semanticError],
        })];
    }
}

async function applyPriorityToProjects(
    param: PrioritySizeContext,
    taskId: string,
    projectRepository: ProjectBoardPriorityPort,
): Promise<Result[]> {
    const projects = param.projects;
    const priorityLabel = resolveGithubPriorityLabel(param.priority.currentLabel ?? '', {
        priorityHigh: param.priority.high,
        priorityMedium: param.priority.medium,
        priorityLow: param.priority.low,
    });
    if (!param.priority.processable || projects.length === 0 || !priorityLabel) {
        return [new Result({ id: taskId, success: true, executed: false })];
    }
    logDebugInfo(`Priority: ${param.priority.currentLabel}`);
    logDebugInfo(`Github Priority Label: ${priorityLabel}`);
    const results: Result[] = [];
    for (const project of projects) {
        if (!await projectRepository.setTaskPriority(
            project,
            param.contentNumber,
            priorityLabel,
        )) continue;
        results.push(new Result({
            id: taskId,
            success: true,
            executed: true,
            steps: [`Priority set to \`${priorityLabel}\` in [${project.title}](${project.url}).`],
        }));
    }
    return results;
}
