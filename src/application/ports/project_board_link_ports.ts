import type { ProjectDetail } from '../../data/model/project_detail';

export interface ProjectBoardLinkPort {
    linkContentId(project: ProjectDetail, contentId: string, token: string): Promise<boolean>;
}
