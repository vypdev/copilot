import { ChangeSizeReconciliation } from './change_size_reconciliation';
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

async function updateOpenPullRequestSize(
    request: ChangeSizeLabelRequest,
    pullRequestNumber: number,
    ports: ChangeSizeLabelPorts,
    reconciliation: ChangeSizeReconciliation,
): Promise<{ pullRequestNumber: number; projectId: string }[]> {
    const pullRequestLabels = await reconciliation.run('pr-label-read', pullRequestNumber, 0, () => ports.issueLabelsPort.getLabels(pullRequestNumber));
    const pullRequestLabelNames = replaceSizeLabel(pullRequestLabels, request.sizeLabels, request.size);
    if (!sameLabels(pullRequestLabels, pullRequestLabelNames)) {
        await reconciliation.run('pr-label-write', pullRequestNumber, 0, () => ports.issueLabelsPort.setLabels(pullRequestNumber, pullRequestLabelNames));
    }
    const pending: { pullRequestNumber: number; projectId: string }[] = [];
    for (const [index, project] of request.projects.entries()) {
        if (await reconciliation.run('pr-project-membership', pullRequestNumber, index + 1, () => ports.projectMembershipQueryPort.isContentLinked(project, pullRequestNumber))) {
            await reconciliation.run('pr-project-size', pullRequestNumber, index + 1, () => ports.projectBoardCommandPort.setTaskSize(project, pullRequestNumber, request.githubSize));
        } else {
            pending.push({ pullRequestNumber, projectId: project.id });
            reconciliation.pendingProjectSizes += 1;
        }
    }
    return pending;
}

export async function updateIssueAndRelatedPullRequests(
    request: ChangeSizeLabelRequest,
    ports: ChangeSizeLabelPorts,
    reconciliation = new ChangeSizeReconciliation(request.issueNumber),
): Promise<ChangeSizeLabelResult> {
    const issueLabelNames = replaceSizeLabel(request.currentIssueLabels, request.sizeLabels, request.size);
    if (!sameLabels(request.currentIssueLabels, issueLabelNames)) {
        await reconciliation.run('issue-labels', request.issueNumber, 0, () => ports.issueLabelsPort.setLabels(request.issueNumber, issueLabelNames));
    }
    for (const [index, project] of request.projects.entries()) {
        await reconciliation.run('issue-project-size', request.issueNumber, index + 1, () => ports.projectBoardCommandPort.setTaskSize(project, request.issueNumber, request.githubSize));
    }

    const openPullRequestNumbers = await reconciliation.run('list-pull-requests', request.issueNumber, 0, () => ports.pullRequestBranchQueryPort.getOpenPullRequestNumbersByHeadBranch(request.headBranch));
    const pendingProjectSizes: { pullRequestNumber: number; projectId: string }[] = [];
    for (const pullRequestNumber of openPullRequestNumbers) {
        pendingProjectSizes.push(...await updateOpenPullRequestSize(request, pullRequestNumber, ports, reconciliation));
    }

    return { issueLabelNames, openPullRequestNumbers, pendingProjectSizes };
}

function sameLabels(current: readonly string[], next: readonly string[]): boolean {
    return current.length === next.length && current.every(label => next.includes(label));
}
