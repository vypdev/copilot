import type { ProjectDetail } from '../data/model/project_detail';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';

export async function loadProjectDetails(
    projectRepository: ProjectDetailQueryPort,
    projectIds: string[],
    owner: string,
    token: string,
): Promise<ProjectDetail[]> {
    if (projectIds.length === 0) {
        return [];
    }

    const normalizedOwner = typeof owner === 'string' ? owner.trim() : '';
    if (!normalizedOwner) {
        throw new Error('Repository owner is required to load project details.');
    }

    const projects: ProjectDetail[] = [];
    for (const projectId of projectIds) {
        projects.push(await projectRepository.getProjectDetail(projectId, normalizedOwner, token));
    }
    return projects;
}
