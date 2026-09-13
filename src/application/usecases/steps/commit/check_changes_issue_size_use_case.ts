import type { Result } from '../../../../data/model/result';
import type { BoundBranchChangeSizePort } from '../../../ports/branch_change_ports';
import type { BoundProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { BoundIssueLabelsPort } from '../../../ports/issue_management_ports';
import type { BoundPullRequestBranchQueryPort } from '../../../ports/pull_request_branch_ports';
import type { ChangeSizeContext } from '../../push_single_action_contexts';
import { logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { runCheckChangesIssueSize } from './check_changes_issue_size_workflow';

export class CheckChangesIssueSizeUseCase implements ParamUseCase<ChangeSizeContext, Result[]> {
    taskId = 'CheckChangesIssueSizeUseCase';

    constructor(
        private readonly projectBoardCommandPort: BoundProjectBoardCommandPort,
        private readonly issueRepository: BoundIssueLabelsPort,
        private readonly pullRequestRepository: BoundPullRequestBranchQueryPort,
        private readonly branchChangeSizePort: BoundBranchChangeSizePort,
    ) {}

    async invoke(param: ChangeSizeContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runCheckChangesIssueSize(param, this.taskId, {
            projectBoardCommandPort: this.projectBoardCommandPort,
            issueRepository: this.issueRepository,
            pullRequestRepository: this.pullRequestRepository,
            branchChangeSizePort: this.branchChangeSizePort,
        });
    }
}
