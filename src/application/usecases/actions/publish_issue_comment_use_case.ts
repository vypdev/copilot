import type { Execution } from '../../../data/model/execution';
import type { Result } from '../../../data/model/result';
import type { IssueCommentPublicationPort } from '../../ports/issue_lifecycle_ports';
import { logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import type { ParamUseCase } from '../base/param_usecase';
import { runPublishIssueComment } from './publish_issue_comment_workflow';

/** Application boundary for creating or updating a specific issue comment. */
export class PublishIssueCommentUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'PublishIssueCommentUseCase';

    constructor(private readonly issueCommentPort: IssueCommentPublicationPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPublishIssueComment(param, this.taskId, this.issueCommentPort);
    }
}
