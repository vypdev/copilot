import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { ParamUseCase } from '../../base/param_usecase';
import { CommentLanguageTranslationWorkflow } from '../common/comment_language_translation_workflow';
export declare class CheckPullRequestCommentLanguageUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string;
    private readonly workflow;
    constructor(workflow: CommentLanguageTranslationWorkflow);
    invoke(param: Execution): Promise<Result[]>;
}
