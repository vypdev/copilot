import type { Result } from '../../../../data/model/result';
import type { BoundIssueTitlePort } from '../../../../application/ports/issue_title_ports';
import { logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { runIssueTitleUpdate, runPullRequestTitleUpdate, titleUpdateFailure, type UpdateTitleContext } from './update_title_workflow';

export class UpdateTitleUseCase implements ParamUseCase<UpdateTitleContext, Result[]> {
    taskId = 'UpdateTitleUseCase';

    constructor(private readonly issueRepository: BoundIssueTitlePort) {}

    async invoke(param: UpdateTitleContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        try {
            if (param.kind === 'issue') return await runIssueTitleUpdate(param, this.taskId, this.issueRepository);
            if (param.kind === 'pull-request') return await runPullRequestTitleUpdate(param, this.taskId, this.issueRepository);
            return [];
        } catch (error) {
            return [titleUpdateFailure(this.taskId, error)];
        }
    }
}
