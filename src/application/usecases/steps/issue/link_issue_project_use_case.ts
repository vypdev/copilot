import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueIdentityQueryPort } from '../../../../application/ports/issue_identity_ports';
import type { ProjectBoardCommandPort } from '../../../../application/ports/project_board_command_ports';
import type { ProjectBoardLinkPort } from '../../../../application/ports/project_board_link_ports';
import type { EventualConsistencyDelayPort } from '../../../../application/ports/eventual_consistency_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runProjectContentLinkWorkflow } from '../common/project_content_link_workflow';

/** Application boundary for linking issues to configured ProjectV2 boards. */
export class LinkIssueProjectUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'LinkIssueProjectUseCase';

    constructor(
        private readonly issueRepository: IssueIdentityQueryPort,
        private readonly projectCommandRepository: ProjectBoardCommandPort,
        private readonly projectLinkRepository: ProjectBoardLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runProjectContentLinkWorkflow(param, {
            projectBoardCommandPort: this.projectCommandRepository,
            projectBoardLinkPort: this.projectLinkRepository,
            eventualConsistencyDelayPort: this.eventualConsistencyDelayPort,
            resolveContentId: () => this.issueRepository.getId(
                param.owner,
                param.repo,
                param.issue.number,
                param.tokens.token,
            ),
            contentType: 'issue',
            columnName: param.project.getProjectColumnIssueCreated(),
            taskId: this.taskId,
        });
    }
}
