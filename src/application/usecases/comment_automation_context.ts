import type { BugbotReviewConfiguration } from '../../domain/bugbot/review_configuration';
import {
    buildCopilotStatusSnapshot,
    type CopilotStatusExecutionContext,
    type CopilotStatusSnapshot,
} from '../policies/status_command_policy';
import {
    projectCommentLanguageRequest,
    type CommentLanguageRequest,
} from './steps/common/comment_language_translation_workflow';
import { projectThinkContext, type ThinkContext, type ThinkContextSource } from './steps/common/think_workflow';
import {
    projectBugbotAutofixOperationContext,
    projectBugbotCommitContext,
    projectBugbotFixIntentContext,
    projectBugbotReviewOperationContext,
    type BugbotAutofixOperationContext,
    type BugbotAutofixOperationSource,
    type BugbotCommitContext,
    type BugbotCommitSource,
    type BugbotFixIntentContext,
    type BugbotFixIntentSource,
    type BugbotReviewOperationContext,
    type BugbotReviewOperationSource,
} from './steps/commit/bugbot/bugbot_review_operation_context';

export interface CommentAutomationContext {
    readonly actor: string;
    readonly trustedBotLogin: string;
    readonly userComment: string;
    readonly membersOnly: boolean;
    readonly language: CommentLanguageRequest;
    readonly think: ThinkContext;
    readonly status: CopilotStatusSnapshot;
    readonly bugbot: {
        readonly fixIntent: BugbotFixIntentContext;
        readonly review: BugbotReviewOperationContext;
        readonly autofix: BugbotAutofixOperationContext;
        readonly commit: BugbotCommitContext;
        readonly publicationMode: BugbotReviewConfiguration['publicationMode'];
    };
}

export type CommentAutomationContextSource =
    & ThinkContextSource
    & CopilotStatusExecutionContext
    & BugbotFixIntentSource
    & BugbotReviewOperationSource
    & BugbotAutofixOperationSource
    & BugbotCommitSource
    & {
        readonly actor: string;
        readonly tokenUser?: string;
        readonly ai: BugbotReviewOperationSource['ai']
            & BugbotAutofixOperationSource['ai']
            & ThinkContextSource['ai']
            & CopilotStatusExecutionContext['ai']
            & {
                getAiMembersOnly(): boolean;
                getBugbotReviewConfiguration(): BugbotReviewConfiguration;
            };
    };

export function projectCommentAutomationContext(
    source: CommentAutomationContextSource,
    language: CommentLanguageRequest,
    userComment: string,
): CommentAutomationContext {
    const review = projectBugbotReviewOperationContext(source);
    return Object.freeze({
        actor: source.actor,
        trustedBotLogin: source.tokenUser?.trim() ?? '',
        userComment,
        membersOnly: source.ai.getAiMembersOnly(),
        language: projectCommentLanguageRequest({
            commentBody: language.commentBody,
            locale: language.locale,
            issueNumber: language.issueNumber,
            commentId: language.commentId,
            configuration: language.configuration === undefined
                ? undefined
                : { ...language.configuration },
        }),
        think: projectThinkContext(source),
        status: buildCopilotStatusSnapshot(source),
        bugbot: Object.freeze({
            fixIntent: projectBugbotFixIntentContext(source),
            review,
            autofix: projectBugbotAutofixOperationContext(source),
            commit: projectBugbotCommitContext(source),
            publicationMode: review.analysis.reviewConfiguration.publicationMode,
        }),
    });
}
