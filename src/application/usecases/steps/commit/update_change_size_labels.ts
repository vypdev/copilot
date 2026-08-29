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

export function replaceSizeLabel(currentLabels: string[], sizeLabels: string[], nextSize: string): string[] {
    return [...currentLabels.filter((name) => !sizeLabels.includes(name)), nextSize];
}

async function updateProjectSize(
    projects: ProjectDetail[],
    owner: string,
    repository: string,
    issueOrPullRequestNumber: number,
    githubSize: string,
    token: string,
    projectBoardCommandPort: ProjectBoardCommandPort,
): Promise<void> {
    for (const project of projects) {
        await projectBoardCommandPort.setTaskSize(
            project,
            owner,
            repository,
            issueOrPullRequestNumber,
            githubSize,
            token,
        );
    }
}

async function updateOpenPullRequestSize(
    request: ChangeSizeLabelRequest,
    pullRequestNumber: number,
    ports: ChangeSizeLabelPorts,
): Promise<void> {
    const pullRequestLabels = await ports.issueLabelsPort.getLabels(
        request.owner,
        request.repository,
        pullRequestNumber,
        request.token,
    );
    const pullRequestLabelNames = replaceSizeLabel(pullRequestLabels, request.sizeLabels, request.size);
    await ports.issueLabelsPort.setLabels(
        request.owner,
        request.repository,
        pullRequestNumber,
        pullRequestLabelNames,
        request.token,
    );
    await updateProjectSize(
        request.projects,
        request.owner,
        request.repository,
        pullRequestNumber,
        request.githubSize,
        request.token,
        ports.projectBoardCommandPort,
    );
}

export async function updateIssueAndRelatedPullRequests(
    request: ChangeSizeLabelRequest,
    ports: ChangeSizeLabelPorts,
): Promise<ChangeSizeLabelResult> {
    const issueLabelNames = replaceSizeLabel(request.currentIssueLabels, request.sizeLabels, request.size);
    await ports.issueLabelsPort.setLabels(
        request.owner,
        request.repository,
        request.issueNumber,
        issueLabelNames,
        request.token,
    );
    await updateProjectSize(
        request.projects,
        request.owner,
        request.repository,
        request.issueNumber,
        request.githubSize,
        request.token,
        ports.projectBoardCommandPort,
    );

    const openPullRequestNumbers = await ports.pullRequestBranchQueryPort.getOpenPullRequestNumbersByHeadBranch(
        request.owner,
        request.repository,
        request.headBranch,
        request.token,
    );
    for (const pullRequestNumber of openPullRequestNumbers) {
        await updateOpenPullRequestSize(request, pullRequestNumber, ports);
    }

    return { issueLabelNames, openPullRequestNumbers };
}
