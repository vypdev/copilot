import type { ProjectDetail } from '../../data/model/project_detail';
export interface ProjectBoardCommandPort {
    setTaskPriority(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, priorityLabel: string, token: string): Promise<boolean>;
    setTaskSize(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, sizeLabel: string, token: string): Promise<boolean>;
    moveIssueToColumn(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, columnName: string, token: string): Promise<boolean>;
}
