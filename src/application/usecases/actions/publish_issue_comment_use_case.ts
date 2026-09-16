import type { Result } from '../../../data/model/result';
import type { BoundIssueCommentUpsertPort } from '../../ports/issue_lifecycle_ports';
import type { IssueCommentActionContext } from '../push_single_action_contexts';
import { logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import type { ParamUseCase } from '../base/param_usecase';
import { runPublishIssueComment } from './publish_issue_comment_workflow';

/** Application boundary for creating or updating a specific issue comment. */
export class PublishIssueCommentUseCase implements ParamUseCase<IssueCommentActionContext, Result[]> {
    taskId = 'PublishIssueCommentUseCase';

    constructor(private readonly issueCommentPort: BoundIssueCommentUpsertPort) {}

    async invoke(param: IssueCommentActionContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPublishIssueComment(param, this.taskId, this.issueCommentPort);
    }
}
