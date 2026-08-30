import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { BranchChangeSizePort } from '../../../ports/branch_change_ports';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { IssueLabelsPort } from '../../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
export interface CheckChangesIssueSizeDependencies {
    projectBoardCommandPort: ProjectBoardCommandPort;
    issueRepository: IssueLabelsPort;
    pullRequestRepository: PullRequestBranchQueryPort;
    branchChangeSizePort: BranchChangeSizePort;
}
export declare function runCheckChangesIssueSize(param: Execution, taskId: string, dependencies: CheckChangesIssueSizeDependencies): Promise<Result[]>;
