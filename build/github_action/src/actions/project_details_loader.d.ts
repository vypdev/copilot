import type { ProjectDetail } from '../data/model/project_detail';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
export declare function loadProjectDetails(projectRepository: ProjectDetailQueryPort, projectIds: string[], owner: string, token: string): Promise<ProjectDetail[]>;
