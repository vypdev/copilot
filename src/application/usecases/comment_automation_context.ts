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
import {
    projectBranchSyncContext,
    projectUserRequestContext,
    type BranchSyncContext,
    type PushSingleActionContextSource,
    type UserRequestContext,
} from './push_single_action_contexts';
import type { CommentLanguageAdaptationPayload } from './steps/common/comment_language_translation_workflow';
import { buildExplicitCommandQuestion } from './steps/common/think_request_policy';
import { extractMentionQuestion } from './steps/common/think_input_policy';
import { parseCopilotCommand } from '../../domain/copilot_command';

export interface CommentAutomationContext {
    readonly actor: string;
    readonly trustedBotLogin: string;
    readonly userComment: string;
    readonly membersOnly: boolean;
    readonly language: CommentLanguageRequest;
    readonly think: ThinkContext;
    readonly status: CopilotStatusSnapshot;
    readonly userRequest: UserRequestContext;
    readonly branchSync: BranchSyncContext;
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
    & PushSingleActionContextSource
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
        userRequest: projectUserRequestContext(source),
        branchSync: projectBranchSyncContext(source),
        bugbot: Object.freeze({
            fixIntent: projectBugbotFixIntentContext(source),
            review,
            autofix: projectBugbotAutofixOperationContext(source),
            commit: projectBugbotCommitContext(source),
            publicationMode: review.analysis.reviewConfiguration.publicationMode,
        }),
    });
}

/** Applies model-produced interpretation only to prose-bearing context copies. */
export function withCommentLanguageAdaptation(
    context: CommentAutomationContext,
    adaptation: CommentLanguageAdaptationPayload,
): CommentAutomationContext {
    if (adaptation.status !== 'translated') return context;
    const userComment = adaptation.interpretedComment;
    const parsed = parseCopilotCommand(userComment);
    const think: ThinkContext = context.think.request.kind === 'ready' && 'agentTask' in context.think
        ? Object.freeze({
            request: Object.freeze({
                ...context.think.request,
                commentBody: userComment,
                question: parsed.kind === 'command'
                    ? buildExplicitCommandQuestion(parsed.command)
                    : extractMentionQuestion(userComment, context.trustedBotLogin),
                ...(parsed.kind === 'command' ? { command: parsed.command } : {}),
            }),
            ...(context.think.tokenUser ? { tokenUser: context.think.tokenUser } : {}),
            agentTask: context.think.agentTask,
            agentConfiguration: context.think.agentConfiguration,
            targetLocale: context.think.targetLocale,
            ...(adaptation.publication ? { translationPublication: adaptation.publication } : {}),
        })
        : context.think;
    return Object.freeze({
        ...context,
        userComment,
        think,
        bugbot: Object.freeze({
            ...context.bugbot,
            fixIntent: Object.freeze({
                ...context.bugbot.fixIntent,
                comment: Object.freeze({ ...context.bugbot.fixIntent.comment, body: userComment }),
            }),
        }),
    });
}
