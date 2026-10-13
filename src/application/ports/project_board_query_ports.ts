import type { ProjectDetail } from '../../data/model/project_detail';
import type { ProjectDetailQueryPort } from './project_detail_ports';
import type { ProjectReference } from './project_board_link_ports';

/** Exact, read-only membership evidence; denied or malformed reads must reject. */
export interface BoundProjectBoardMembershipQueryPort {
    isContentLinked(project: ProjectReference, contentNumber: number): Promise<boolean>;
}

export interface ProjectBoardContentQueryPort {
    getProjectItemId(project: ProjectDetail, owner: string, repository: string, issueOrPullRequestNumber: number, token: string): Promise<string | undefined>;
}

export interface ProjectBoardQueryPort extends ProjectDetailQueryPort {
    getLinkedContentItemId(project: ProjectDetail, contentId: string, token: string): Promise<string | undefined>;
}
