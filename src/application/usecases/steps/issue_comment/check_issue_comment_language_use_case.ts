import { Result } from '../../../../data/model/result';
import { ParamUseCase } from '../../base/param_usecase';
import {
    CommentLanguageTranslationWorkflow,
    projectCommentLanguageRequest,
    type CommentLanguageRequest,
} from '../common/comment_language_translation_workflow';

export interface IssueCommentLanguageSource {
    readonly isPullRequest: boolean;
    readonly issue: { readonly commentBody: string; readonly number: number; readonly commentId: number };
    readonly pullRequest: { readonly number: number };
    readonly locale: { readonly issue: string; readonly pullRequest: string };
    readonly ai: { getAgentConfiguration(task: 'findings'): CommentLanguageRequest['configuration'] };
}

export function projectIssueCommentLanguageRequest(source: IssueCommentLanguageSource): CommentLanguageRequest {
    return projectCommentLanguageRequest({
        commentBody: source.issue.commentBody,
        locale: source.isPullRequest ? source.locale.pullRequest : source.locale.issue,
        issueNumber: source.isPullRequest ? source.pullRequest.number : source.issue.number,
        commentId: source.issue.commentId,
        configuration: source.ai.getAgentConfiguration('findings'),
    });
}

export class CheckIssueCommentLanguageUseCase implements ParamUseCase<CommentLanguageRequest, Result[]> {
    taskId = 'CheckIssueCommentLanguageUseCase';
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
