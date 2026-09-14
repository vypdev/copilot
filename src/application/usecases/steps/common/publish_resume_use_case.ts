import type { Result } from '../../../../data/model/result';
import type { BoundIssueCommentPublicationPort } from '../../../ports/issue_lifecycle_ports';
import { logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { runPublishResume, type PublishResultContext } from './publish_resume_workflow';

export class PublishResultUseCase implements ParamUseCase<PublishResultContext, Result | undefined> {
    taskId = 'PublishResultUseCase';

    constructor(
        private readonly comments: BoundIssueCommentPublicationPort,
    ) {}

    async invoke(param: PublishResultContext): Promise<Result | undefined> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPublishResume(param, this.taskId, this.comments);
    }
}
