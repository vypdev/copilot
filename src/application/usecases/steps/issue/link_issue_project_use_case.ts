import { Result } from '../../../../data/model/result';
import type { BoundProjectContentPort } from '../../../../application/ports/project_board_link_ports';
import type { EventualConsistencyDelayPort } from '../../../../application/ports/eventual_consistency_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runProjectContentLinkWorkflow, type ProjectContentLinkContext } from '../common/project_content_link_workflow';

/** Application boundary for linking issues to configured ProjectV2 boards. */
export class LinkIssueProjectUseCase implements ParamUseCase<ProjectContentLinkContext, Result[]> {
    taskId = 'LinkIssueProjectUseCase';

    constructor(
        private readonly projectContentPort: BoundProjectContentPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: ProjectContentLinkContext): Promise<Result[]> {
        return runProjectContentLinkWorkflow(
            param,
            this.taskId,
            this.projectContentPort,
            () => this.eventualConsistencyDelayPort.wait(10_000),
        );
    }
}
