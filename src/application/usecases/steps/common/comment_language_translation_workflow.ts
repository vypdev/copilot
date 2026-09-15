import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../policies/agent_task_policy';
import type { AgentConfiguration } from '../../../ports/agent_configuration_ports';
import type { LanguageQueryPort } from '../../../ports/agent_language_ports';
import { LANGUAGE_ADAPTATION_RESPONSE_SCHEMA } from '../../../policies/agent_response_schemas';
import { getAdaptCommentLanguagePrompt } from '../../../../prompts';
import { logDebugInfo, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import {
    composeTranslatedComment,
    hasTranslatedCommentMarker,
    prepareLanguageAdaptationInput,
    rebuildAdaptedComment,
    restoreLanguageAdaptationOutput,
    type TranslationPublication,
} from '../../../policies/comment_translation_policy';
import { canonicalizeLocaleTag } from '../../../../domain/locale';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';

export { TRANSLATED_COMMENT_MARKER } from '../../../policies/comment_translation_policy';

export interface CommentLanguageRequest {
    readonly commentBody: string;
    readonly locale: string;
    readonly issueNumber: number;
    readonly commentId: number;
    readonly trustedBotLogin?: string;
    readonly configuration: Readonly<AgentConfiguration> | undefined;
}

export interface CommentLanguageContext extends CommentLanguageRequest {
    readonly taskId: string;
}

export function projectCommentLanguageRequest(
    source: Omit<CommentLanguageRequest, 'configuration'> & { readonly configuration: AgentConfiguration | undefined },
): CommentLanguageRequest {
    return Object.freeze({
        commentBody: source.commentBody,
        locale: source.locale,
        issueNumber: source.issueNumber,
        commentId: source.commentId,
        ...(source.trustedBotLogin?.trim() ? { trustedBotLogin: source.trustedBotLogin.trim() } : {}),
        configuration: source.configuration === undefined
            ? undefined
            : Object.freeze({ ...source.configuration }),
    });
}

export class CommentLanguageTranslationWorkflow {
    constructor(private readonly languageQueryPort: LanguageQueryPort) {}

    async invoke(context: CommentLanguageContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(context.taskId)} Executing ${context.taskId}.`);
        const targetLocale = canonicalizeLocaleTag(context.locale);
        if (!context.commentBody || hasTranslatedCommentMarker(context.commentBody)) {
            return [new Result({ id: context.taskId, success: true, executed: false })];
        }

        const input = prepareLanguageAdaptationInput(context.commentBody, context.trustedBotLogin ?? '');
        if (!input.prose) return [adaptationResult(context, targetLocale, 'matches', context.commentBody)];
        try {
            const response = await this.languageQueryPort.query({
                configuration: context.configuration,
                agentId: AGENT_PLAN,
                prompt: getAdaptCommentLanguagePrompt({ locale: targetLocale, commentBody: input.prose }),
                options: {
                    expectJson: true,
                    schema: LANGUAGE_ADAPTATION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                    schemaName: 'language_adaptation_response',
                },
            });
            const status = this.stringProperty(response, 'status');
            const responseTarget = this.stringProperty(response, 'targetLocale');
            const reasonCode = this.validReasonCode(this.stringProperty(response, 'reasonCode'));
            logDebugInfo(`${context.taskId}: language adaptation status=${status}.`);
            if (responseTarget !== targetLocale) {
                return [failedAdaptation(context, targetLocale, 'The language adapter returned a mismatched target locale.')];
            }
            if (status === 'matches' || status === 'ambiguous') {
                return [adaptationResult(
                    context,
                    targetLocale,
                    status,
                    context.commentBody,
                    this.optionalStringProperty(response, 'sourceLocale'),
                    reasonCode,
                )];
            }
            if (status !== 'translated') {
                return [failedAdaptation(context, targetLocale, `Language adaptation ended with ${status || 'an invalid status'}.`)];
            }
            const adaptedText = this.stringProperty(response, 'adaptedText');
            const sourceLocale = this.optionalStringProperty(response, 'sourceLocale');
            const restoredProse = restoreLanguageAdaptationOutput(input, adaptedText);
            const interpretedComment = rebuildAdaptedComment(input, adaptedText);
            if (restoredProse === undefined || interpretedComment === undefined) {
                return [failedAdaptation(
                    context,
                    targetLocale,
                    'The language adapter changed or introduced a protected technical operand.',
                )];
            }
            const publication = composeTranslatedComment(restoredProse, context.commentBody, {
                sourceLocale,
                targetLocale,
            });
            if (!publication) {
                return [failedAdaptation(context, targetLocale, 'The language adapter returned unsafe or empty text.')];
            }
            return [adaptationResult(
                context,
                targetLocale,
                'translated',
                interpretedComment,
                sourceLocale,
                reasonCode,
                publication,
            )];
        } catch (error) {
            logInfo('Language adaptation failed; the source comment was preserved and no requested mutation ran.');
            return [new Result({
                id: context.taskId,
                success: false,
                executed: true,
                errors: [toApplicationError(error, 'locale.translation-failed', 'I could not safely interpret this request, so no repository change was made. Please rephrase it or try again.')],
                payload: languageAdaptationPayload('failed', targetLocale, context.commentBody, undefined, 'provider-failure'),
            })];
        }
    }

    private stringProperty(value: unknown, property: string): string {
        if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[property] === 'string') {
            return (value as Record<string, string>)[property];
        }
        return '';
    }

    private optionalStringProperty(value: unknown, property: string): string | undefined {
        const text = this.stringProperty(value, property).trim();
        if (!text) return undefined;
        try {
            return canonicalizeLocaleTag(text);
        } catch {
            return undefined;
        }
    }

    private validReasonCode(value: string): CommentLanguageAdaptationPayload['reasonCode'] {
        return ['none', 'mixed-language', 'code-only', 'too-short', 'unsafe-input', 'provider-failure', 'unknown'].includes(value)
            ? value as CommentLanguageAdaptationPayload['reasonCode']
            : 'unknown';
    }
}

export type CommentLanguageAdaptationPayload = {
    readonly kind: 'comment-language-adaptation';
    readonly status: 'matches' | 'translated' | 'ambiguous' | 'failed';
    readonly targetLocale: string;
    readonly interpretedComment: string;
    readonly sourceLocale?: string;
    readonly reasonCode: 'none' | 'mixed-language' | 'code-only' | 'too-short' | 'unsafe-input' | 'provider-failure' | 'unknown';
    readonly publication?: TranslationPublication;
};

export function getCommentLanguageAdaptationPayload(result: Result): CommentLanguageAdaptationPayload | undefined {
    const payload = result.payload;
    return payload && typeof payload === 'object'
        && (payload as { kind?: unknown }).kind === 'comment-language-adaptation'
        ? payload as CommentLanguageAdaptationPayload
        : undefined;
}

function adaptationResult(
    context: CommentLanguageContext,
    targetLocale: string,
    status: 'matches' | 'translated' | 'ambiguous',
    interpretedComment: string,
    sourceLocale?: string,
    reasonCode: CommentLanguageAdaptationPayload['reasonCode'] = 'none',
    publication?: TranslationPublication,
): Result {
    return new Result({
        id: context.taskId,
        success: true,
        executed: true,
        payload: languageAdaptationPayload(status, targetLocale, interpretedComment, sourceLocale, reasonCode, publication),
    });
}

function failedAdaptation(context: CommentLanguageContext, targetLocale: string, reason: string): Result {
    return new Result({
        id: context.taskId,
        success: false,
        executed: true,
        errors: [new ApplicationError(
            'locale.translation-failed',
            'I could not safely interpret this request, so no repository change was made. Please rephrase it or try again.',
            { cause: reason },
        )],
        payload: languageAdaptationPayload('failed', targetLocale, context.commentBody, undefined, 'unknown'),
    });
}

function languageAdaptationPayload(
    status: CommentLanguageAdaptationPayload['status'],
    targetLocale: string,
    interpretedComment: string,
    sourceLocale?: string,
    reasonCode: CommentLanguageAdaptationPayload['reasonCode'] = 'none',
    publication?: TranslationPublication,
): CommentLanguageAdaptationPayload {
    return Object.freeze({
        kind: 'comment-language-adaptation',
        status,
        targetLocale,
        interpretedComment,
        reasonCode,
        ...(sourceLocale ? { sourceLocale } : {}),
        ...(publication ? { publication: Object.freeze({ ...publication }) } : {}),
    });
}
