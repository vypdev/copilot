import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { ParamUseCase } from '../../base/param_usecase';
import { CommentLanguageTranslationWorkflow } from '../common/comment_language_translation_workflow';

export class CheckPullRequestCommentLanguageUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'CheckPullRequestCommentLanguageUseCase';
    private readonly workflow: CommentLanguageTranslationWorkflow;

    constructor(workflow: CommentLanguageTranslationWorkflow) {
        this.workflow = workflow;
    }

    invoke(param: Execution): Promise<Result[]> {
        return this.workflow.invoke({
            taskId: this.taskId,
            commentBody: param.pullRequest.commentBody,
            locale: param.locale.pullRequest,
            issueNumber: param.pullRequest.number,
            commentId: param.pullRequest.commentId,
            owner: param.owner,
            repo: param.repo,
            token: param.tokens.token,
            configuration: param.ai?.getAgentConfiguration('findings'),
        });
    }
}
