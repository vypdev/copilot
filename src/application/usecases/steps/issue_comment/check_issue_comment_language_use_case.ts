import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { ParamUseCase } from '../../base/param_usecase';
import { CommentLanguageTranslationWorkflow } from '../common/comment_language_translation_workflow';

export class CheckIssueCommentLanguageUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'CheckIssueCommentLanguageUseCase';
    private readonly workflow: CommentLanguageTranslationWorkflow;

    constructor(workflow: CommentLanguageTranslationWorkflow) {
        this.workflow = workflow;
    }

    invoke(param: Execution): Promise<Result[]> {
        return this.workflow.invoke({
            taskId: this.taskId,
            commentBody: param.issue.commentBody,
            locale: param.locale.issue,
            issueNumber: param.issue.number,
            commentId: param.issue.commentId,
            owner: param.owner,
            repo: param.repo,
            token: param.tokens.token,
            configuration: param.ai?.getAgentConfiguration('findings'),
        });
    }
}
