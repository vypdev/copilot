import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../policies/agent_task_policy';
import type { AgentConfiguration } from '../../../ports/agent_configuration_ports';
import type { LanguageQueryPort } from '../../../ports/agent_language_ports';
import { LANGUAGE_CHECK_RESPONSE_SCHEMA, TRANSLATION_RESPONSE_SCHEMA } from '../../../policies/agent_response_schemas';
import type { BoundIssueCommentUpdatePort } from '../../../ports/issue_lifecycle_ports';
import { getCheckCommentLanguagePrompt, getTranslateCommentPrompt } from '../../../../prompts';
import { logDebugInfo, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import {
    composeTranslatedComment,
    hasTranslatedCommentMarker,
} from '../../../policies/comment_translation_policy';

export { TRANSLATED_COMMENT_MARKER } from '../../../policies/comment_translation_policy';

export interface CommentLanguageRequest {
    readonly commentBody: string;
    readonly locale: string;
    readonly issueNumber: number;
    readonly commentId: number;
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
        configuration: source.configuration === undefined
            ? undefined
            : Object.freeze({ ...source.configuration }),
    });
}

export class CommentLanguageTranslationWorkflow {
    constructor(
        private readonly commentRepository: BoundIssueCommentUpdatePort,
        private readonly languageQueryPort: LanguageQueryPort,
    ) {}

    async invoke(context: CommentLanguageContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(context.taskId)} Executing ${context.taskId}.`);
        if (!context.commentBody || hasTranslatedCommentMarker(context.commentBody)) {
            return [new Result({ id: context.taskId, success: true, executed: false })];
        }

        const configuration = context.configuration;
        const checkResponse = await this.languageQueryPort.query({
            configuration,
            agentId: AGENT_PLAN,
            prompt: getCheckCommentLanguagePrompt({ locale: context.locale, commentBody: context.commentBody }),
            options: {
                expectJson: true,
                schema: LANGUAGE_CHECK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                schemaName: 'language_check_response',
            },
        });
        const status = this.stringProperty(checkResponse, 'status');
        logDebugInfo(`${context.taskId}: language check status=${status}.`);
        if (status === 'done') return [new Result({ id: context.taskId, success: true, executed: true })];

        const translationResponse = await this.languageQueryPort.query({
            configuration,
            agentId: AGENT_PLAN,
            prompt: getTranslateCommentPrompt({ locale: context.locale, commentBody: context.commentBody }),
            options: {
                expectJson: true,
                schema: TRANSLATION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                schemaName: 'translation_response',
            },
        });
        const translatedText = this.stringProperty(translationResponse, 'translatedText');
        const publication = composeTranslatedComment(translatedText, context.commentBody);
        if (!publication) {
            const reason = this.stringProperty(translationResponse, 'reason');
            logInfo(`Translation output was rejected; skipping comment update.${reason ? ` Reason: ${reason}` : ' The configured agent may have failed or returned an invalid response.'}`);
            return [new Result({ id: context.taskId, success: true, executed: false })];
        }

        await this.commentRepository.updateComment(
            context.issueNumber,
            context.commentId,
            publication.commentBody,
        );
        return [];
    }

    private stringProperty(value: unknown, property: string): string {
        if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[property] === 'string') {
            return (value as Record<string, string>)[property];
        }
        return '';
    }
}
