import type { ProjectDetail } from '../../../../data/model/project_detail';
import type { IssueLabelsPort } from '../../../ports/issue_management_ports';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { PullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
interface ChangeSizeLabelPorts {
    readonly issueLabelsPort: IssueLabelsPort;
    readonly projectBoardCommandPort: ProjectBoardCommandPort;
    readonly pullRequestBranchQueryPort: PullRequestBranchQueryPort;
}
export interface ChangeSizeLabelRequest {
    owner: string;
    repository: string;
    issueNumber: number;
    headBranch: string;
    size: string;
    githubSize: string;
    currentIssueLabels: string[];
    sizeLabels: string[];
    projects: ProjectDetail[];
    token: string;
}
export interface ChangeSizeLabelResult {
    issueLabelNames: string[];
    openPullRequestNumbers: number[];
}
export declare function replaceSizeLabel(currentLabels: string[], sizeLabels: string[], nextSize: string): string[];
export declare function updateIssueAndRelatedPullRequests(request: ChangeSizeLabelRequest, ports: ChangeSizeLabelPorts): Promise<ChangeSizeLabelResult>;
export {};
