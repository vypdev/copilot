import { Result } from '../../../../data/model/result';
import { ParamUseCase } from '../../base/param_usecase';
import {
    CommentLanguageTranslationWorkflow,
    projectCommentLanguageRequest,
    type CommentLanguageRequest,
} from '../common/comment_language_translation_workflow';

export interface PullRequestCommentLanguageSource {
    readonly pullRequest: { readonly commentBody: string; readonly number: number; readonly commentId: number };
    readonly locale: { readonly pullRequest: string };
    readonly ai: { getAgentConfiguration(task: 'findings'): CommentLanguageRequest['configuration'] };
}

export function projectPullRequestCommentLanguageRequest(source: PullRequestCommentLanguageSource): CommentLanguageRequest {
    return projectCommentLanguageRequest({
        commentBody: source.pullRequest.commentBody,
        locale: source.locale.pullRequest,
        issueNumber: source.pullRequest.number,
        commentId: source.pullRequest.commentId,
        configuration: source.ai.getAgentConfiguration('findings'),
    });
}

export class CheckPullRequestCommentLanguageUseCase implements ParamUseCase<CommentLanguageRequest, Result[]> {
    taskId = 'CheckPullRequestCommentLanguageUseCase';
    private readonly workflow: CommentLanguageTranslationWorkflow;

    constructor(workflow: CommentLanguageTranslationWorkflow) {
        this.workflow = workflow;
    }

    invoke(param: CommentLanguageRequest): Promise<Result[]> {
        return this.workflow.invoke({
            ...param,
            taskId: this.taskId,
        });
    }
}
