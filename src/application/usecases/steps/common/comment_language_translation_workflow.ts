import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../policies/agent_task_policy';
import type { AgentConfiguration } from '../../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import { LANGUAGE_CHECK_RESPONSE_SCHEMA, TRANSLATION_RESPONSE_SCHEMA } from '../../../policies/agent_response_schemas';
import type { IssueCommentUpdatePort } from '../../../ports/issue_lifecycle_ports';
import { getCheckCommentLanguagePrompt, getTranslateCommentPrompt } from '../../../../prompts';
import { logDebugInfo, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';

export const TRANSLATED_COMMENT_MARKER = `<!-- content_translated
If you'd like this comment to be translated again, please delete the entire comment, including this message. It will then be processed as a new one.
-->`;

export type CommentLanguageContext = {
    taskId: string;
    commentBody: string;
    locale: string;
    issueNumber: number;
    commentId: number;
    owner: string;
    repo: string;
    token: string;
    configuration: AgentConfiguration | undefined;
};

export class CommentLanguageTranslationWorkflow {
    constructor(
        private readonly commentRepository: IssueCommentUpdatePort,
        private readonly findingsQueryPort: FindingsQueryPort,
    ) {}

    async invoke(context: CommentLanguageContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(context.taskId)} Executing ${context.taskId}.`);
        if (!context.commentBody || context.commentBody.includes(TRANSLATED_COMMENT_MARKER)) {
            return [new Result({ id: context.taskId, success: true, executed: false })];
        }

        const configuration = context.configuration;
        const checkResponse = await this.findingsQueryPort.query({
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

        const translationResponse = await this.findingsQueryPort.query({
            configuration,
            agentId: AGENT_PLAN,
            prompt: getTranslateCommentPrompt({ locale: context.locale, commentBody: context.commentBody }),
            options: {
                expectJson: true,
                schema: TRANSLATION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                schemaName: 'translation_response',
            },
        });
        const translatedText = this.stringProperty(translationResponse, 'translatedText').trim();
        if (!translatedText) {
            const reason = this.stringProperty(translationResponse, 'reason');
            logInfo(`Translation returned no text; skipping comment update.${reason ? ` Reason: ${reason}` : ' The configured agent may have failed or returned an invalid response.'}`);
            return [new Result({ id: context.taskId, success: true, executed: false })];
        }

        await this.commentRepository.updateComment(
            context.owner,
            context.repo,
            context.issueNumber,
            context.commentId,
            `${translatedText}\n> ${context.commentBody}\n${TRANSLATED_COMMENT_MARKER}\n`,
            context.token,
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
