import type { CheckChangesIssueSizeDependencies } from '../../application/usecases/steps/commit/check_changes_issue_size_workflow';
import { withChangeSizeProviderFailure as observe } from '../../data/repository/github/change_size_provider_failure';

/** Keep provider DTO inspection at the adapter boundary and preserve narrow port authority. */
export function withChangeSizeDiagnostics(ports: CheckChangesIssueSizeDependencies): CheckChangesIssueSizeDependencies {
    return {
        issueRepository: {
            getLabels: number => observe(() => ports.issueRepository.getLabels(number)),
            setLabels: (number, labels) => observe(() => ports.issueRepository.setLabels(number, labels)),
        },
        projectBoardCommandPort: {
            ...ports.projectBoardCommandPort,
            setTaskSize: (project, number, size) => observe(() => ports.projectBoardCommandPort.setTaskSize(project, number, size)),
        },
        pullRequestRepository: {
            getOpenPullRequestNumbersByHeadBranch: branch => observe(() => ports.pullRequestRepository.getOpenPullRequestNumbersByHeadBranch(branch)),
        },
        branchChangeSizePort: {
            getSizeCategoryAndReason: (head, base, thresholds, labels) => observe(() => ports.branchChangeSizePort.getSizeCategoryAndReason(head, base, thresholds, labels)),
        },
        projectMembershipQueryPort: {
            isContentLinked: (project, number) => observe(() => ports.projectMembershipQueryPort.isContentLinked(project, number)),
        },
    };
}
