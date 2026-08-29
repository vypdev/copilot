import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { ProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import type { ProjectBoardLinkPort } from '../../../ports/project_board_link_ports';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runProjectContentLinkWorkflow } from '../common/project_content_link_workflow';

/** Application boundary for linking pull requests to configured ProjectV2 boards. */
export class LinkPullRequestProjectUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'LinkPullRequestProjectUseCase';

    constructor(
        private readonly projectBoardCommandPort: ProjectBoardCommandPort,
        private readonly projectBoardLinkPort: ProjectBoardLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runProjectContentLinkWorkflow(param, {
            projectBoardCommandPort: this.projectBoardCommandPort,
            projectBoardLinkPort: this.projectBoardLinkPort,
            eventualConsistencyDelayPort: this.eventualConsistencyDelayPort,
            resolveContentId: async () => param.pullRequest.id,
            contentType: 'pull request',
            columnName: param.project.getProjectColumnPullRequestCreated(),
            taskId: this.taskId,
        });
    }
}
