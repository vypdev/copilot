import type { ProjectDetail } from '../../data/model/project_detail';
import type { ProjectDetailQueryPort } from './project_detail_ports';
export interface ProjectBoardContentQueryPort {
    getProjectItemId(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, token: string): Promise<string | undefined>;
}
export interface ProjectBoardQueryPort extends ProjectDetailQueryPort {
    isContentLinked(project: ProjectDetail, contentId: string, token: string): Promise<boolean>;
}
