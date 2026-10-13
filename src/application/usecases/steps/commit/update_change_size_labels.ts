import type { ProjectReference } from '../../../ports/project_board_link_ports';
import type { BoundIssueLabelsPort } from '../../../ports/issue_management_ports';
import type { BoundProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { BoundPullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
import type { BoundProjectBoardMembershipQueryPort } from '../../../ports/project_board_query_ports';

interface ChangeSizeLabelPorts {
    readonly issueLabelsPort: BoundIssueLabelsPort;
    readonly projectBoardCommandPort: BoundProjectBoardCommandPort;
    readonly pullRequestBranchQueryPort: BoundPullRequestBranchQueryPort;
    readonly projectMembershipQueryPort: BoundProjectBoardMembershipQueryPort;
}

export interface ChangeSizeLabelRequest {
    issueNumber: number;
    headBranch: string;
    size: string;
    githubSize: string;
    currentIssueLabels: readonly string[];
    sizeLabels: readonly string[];
    projects: readonly ProjectReference[];
}

export interface ChangeSizeLabelResult {
    issueLabelNames: string[];
    openPullRequestNumbers: readonly number[];
    pendingProjectSizes: readonly { pullRequestNumber: number; projectId: string }[];
}

export function replaceSizeLabel(currentLabels: readonly string[], sizeLabels: readonly string[], nextSize: string): string[] {
    return [...currentLabels.filter((name) => !sizeLabels.includes(name)), nextSize];
}

async function updateProjectSize(
    projects: readonly ProjectReference[],
    issueOrPullRequestNumber: number,
    githubSize: string,
    projectBoardCommandPort: BoundProjectBoardCommandPort,
): Promise<void> {
    for (const project of projects) {
        await projectBoardCommandPort.setTaskSize(
            project,
            issueOrPullRequestNumber,
            githubSize,
        );
    }
}

async function updateOpenPullRequestSize(
    request: ChangeSizeLabelRequest,
    pullRequestNumber: number,
    ports: ChangeSizeLabelPorts,
): Promise<{ pullRequestNumber: number; projectId: string }[]> {
    const pullRequestLabels = await ports.issueLabelsPort.getLabels(
        pullRequestNumber,
    );
    const pullRequestLabelNames = replaceSizeLabel(pullRequestLabels, request.sizeLabels, request.size);
    if (!sameLabels(pullRequestLabels, pullRequestLabelNames)) {
        await ports.issueLabelsPort.setLabels(pullRequestNumber, pullRequestLabelNames);
    }
    const pending: { pullRequestNumber: number; projectId: string }[] = [];
    for (const project of request.projects) {
        if (await ports.projectMembershipQueryPort.isContentLinked(project, pullRequestNumber)) {
            await ports.projectBoardCommandPort.setTaskSize(project, pullRequestNumber, request.githubSize);
        } else pending.push({ pullRequestNumber, projectId: project.id });
    }
    return pending;
}

export async function updateIssueAndRelatedPullRequests(
    request: ChangeSizeLabelRequest,
    ports: ChangeSizeLabelPorts,
): Promise<ChangeSizeLabelResult> {
    const issueLabelNames = replaceSizeLabel(request.currentIssueLabels, request.sizeLabels, request.size);
    if (!sameLabels(request.currentIssueLabels, issueLabelNames)) {
        await ports.issueLabelsPort.setLabels(request.issueNumber, issueLabelNames);
    }
    await updateProjectSize(
        request.projects,
        request.issueNumber,
        request.githubSize,
        ports.projectBoardCommandPort,
    );

    const openPullRequestNumbers = await ports.pullRequestBranchQueryPort.getOpenPullRequestNumbersByHeadBranch(
        request.headBranch,
    );
    const pendingProjectSizes: { pullRequestNumber: number; projectId: string }[] = [];
    for (const pullRequestNumber of openPullRequestNumbers) {
        pendingProjectSizes.push(...await updateOpenPullRequestSize(request, pullRequestNumber, ports));
    }

    return { issueLabelNames, openPullRequestNumbers, pendingProjectSizes };
}

function sameLabels(current: readonly string[], next: readonly string[]): boolean {
    return current.length === next.length && current.every(label => next.includes(label));
}
