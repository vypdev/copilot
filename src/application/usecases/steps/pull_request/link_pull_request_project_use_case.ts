import { Result } from '../../../../data/model/result';
import type { BoundProjectContentPort } from '../../../ports/project_board_link_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runProjectContentLinkWorkflow, type ProjectContentLinkContext } from '../common/project_content_link_workflow';

/** Application boundary for linking pull requests to configured ProjectV2 boards. */
export class LinkPullRequestProjectUseCase implements ParamUseCase<ProjectContentLinkContext, Result[]> {
    taskId = 'LinkPullRequestProjectUseCase';

    constructor(private readonly projectContentPort: BoundProjectContentPort) {}

    async invoke(param: ProjectContentLinkContext): Promise<Result[]> {
        return runProjectContentLinkWorkflow(
            param,
            this.taskId,
            this.projectContentPort,
        );
    }
}
