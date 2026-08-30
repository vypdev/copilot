import type { Execution } from '../../../../data/model/execution';
import type { Result } from '../../../../data/model/result';
import type { IssueTitlePort } from '../../../../application/ports/issue_title_ports';
import { logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { runIssueTitleUpdate, runPullRequestTitleUpdate, titleUpdateFailure } from './update_title_workflow';

export class UpdateTitleUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'UpdateTitleUseCase';

    constructor(private readonly issueRepository: IssueTitlePort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        try {
            if (param.isIssue) return await runIssueTitleUpdate(param, this.taskId, this.issueRepository);
            if (param.isPullRequest) return await runPullRequestTitleUpdate(param, this.taskId, this.issueRepository);
            return [];
        } catch (error) {
            return [titleUpdateFailure(this.taskId, error)];
        }
    }
}
