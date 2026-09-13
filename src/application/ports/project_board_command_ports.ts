import type { ProjectDetail } from '../../data/model/project_detail';
import type { ProjectReference } from './project_board_link_ports';

export interface ProjectBoardCommandPort {
    setTaskPriority(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, priorityLabel: string, token: string): Promise<boolean>;
    setTaskSize(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, sizeLabel: string, token: string): Promise<boolean>;
    moveIssueToColumn(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, columnName: string, token: string): Promise<boolean>;
}

/** Repository-credential-bound project mutations for lifecycle steps. */
export interface BoundProjectBoardCommandPort {
    setTaskPriority(project: ProjectReference, issueOrPullRequestNumber: number, priorityLabel: string): Promise<boolean>;
    moveIssueToColumn(project: ProjectReference, issueOrPullRequestNumber: number, columnName: string): Promise<boolean>;
}
