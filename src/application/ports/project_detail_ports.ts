import type { ProjectDetail } from '../../data/model/project_detail';

export interface ProjectDetailQueryPort {
    getProjectDetail(projectId: string, token: string): Promise<ProjectDetail>;
}
