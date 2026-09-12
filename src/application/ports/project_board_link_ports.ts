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
    linkContentId(project: ProjectDetail, contentId: string, token: string): Promise<boolean>;
}

/** Repository-credential-bound project authority for one content-link workflow. */
export interface BoundProjectContentPort {
    resolveIssueContentId(issueNumber: number): Promise<string>;
    linkContentId(project: ProjectReference, contentId: string): Promise<boolean>;
    moveContent(project: ProjectReference, contentNumber: number, columnName: string): Promise<boolean>;
}
