import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { ProjectDetail } from '../../../../data/model/project_detail';
import type { ProjectBoardCommandPort } from '../../../../application/ports/project_board_command_ports';
interface PrioritySizeParam {
    labels: {
        priorityLabelOnIssue: string;
        priorityLabelOnIssueProcessable: boolean;
        priorityHigh: string;
        priorityMedium: string;
        priorityLow: string;
    };
    project: {
        getProjects(): ProjectDetail[];
    };
    owner: string;
    repo: string;
    issueNumber: number;
    tokens: {
        token: string;
    };
}
export type ProjectBoardPriorityPort = Pick<ProjectBoardCommandPort, 'setTaskPriority'>;
export declare function runPrioritySizeCheck(param: Execution | PrioritySizeParam, taskId: string, contentNumber: number, projectRepository: ProjectBoardPriorityPort): Promise<Result[]>;
export {};
