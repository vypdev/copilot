import type { Execution } from '../../../../data/model/execution';
import type { Result } from '../../../../data/model/result';
import type { BranchChangeSizePort } from '../../../ports/branch_change_ports';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { IssueLabelsPort } from '../../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
import { logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { runCheckChangesIssueSize } from './check_changes_issue_size_workflow';

export class CheckChangesIssueSizeUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'CheckChangesIssueSizeUseCase';

    constructor(
        private readonly projectBoardCommandPort: ProjectBoardCommandPort,
        private readonly issueRepository: IssueLabelsPort,
        private readonly pullRequestRepository: PullRequestBranchQueryPort,
        private readonly branchChangeSizePort: BranchChangeSizePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runCheckChangesIssueSize(param, this.taskId, {
            projectBoardCommandPort: this.projectBoardCommandPort,
            issueRepository: this.issueRepository,
            pullRequestRepository: this.pullRequestRepository,
            branchChangeSizePort: this.branchChangeSizePort,
        });
    }
}
