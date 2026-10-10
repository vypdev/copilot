import type { ProjectDetail } from '../../data/model/project_detail';

export interface ProjectReference {
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly owner: string;
    readonly url: string;
    readonly number: number;
}

export interface ProjectBoardLinkPort {
    linkContentId(project: ProjectDetail, contentId: string, token: string): Promise<string>;
}

export type ProjectStatusInitialization = 'initialized' | 'retained' | 'failed';

/** Repository-credential-bound project authority for one content-link workflow. */
export interface BoundProjectContentPort {
    resolveIssueContentId(issueNumber: number): Promise<string>;
    linkContentId(project: ProjectReference, contentId: string): Promise<string>;
    initializeStatus(project: ProjectReference, projectItemId: string, columnName: string): Promise<ProjectStatusInitialization>;
}
