import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { ProjectBoardLinkPort } from '../../../ports/project_board_link_ports';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
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
export declare function runProjectContentLinkWorkflow(param: Execution, dependencies: ProjectContentLinkWorkflowDependencies): Promise<Result[]>;
