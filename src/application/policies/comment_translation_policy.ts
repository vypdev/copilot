import {
    createUntrustedContent,
    DEFAULT_UNTRUSTED_CONTENT_LIMIT,
} from '../../domain/security/untrusted_content';
import { escapeHtml, sanitizeAgentMarkdown } from './github_comment_publication_policy';
import { parseCopilotCommand, type CopilotCommandName } from '../../domain/copilot_command';
import { extractMentionQuestion } from '../usecases/steps/common/think_input_policy';

/** Opaque marker: it is metadata, not an instruction for another agent. */
export const LEGACY_TRANSLATED_COMMENT_MARKER = '<!-- copilot:translated-comment:v2 -->';
export const TRANSLATED_COMMENT_MARKER = '<!-- copilot:request-translation schema="3" -->';

const MAX_TRANSLATED_COMMENT_LENGTH = DEFAULT_UNTRUSTED_CONTENT_LIMIT;
const MAX_ESCAPED_ORIGINAL_LENGTH = 40_000;

export type TranslationPublication = {
    readonly translatedText: string;
    readonly commentBody: string;
};

export type LanguageAdaptationInput = {
    readonly kind: 'command' | 'mention' | 'plain';
    readonly prose: string;
    readonly commandName?: CopilotCommandName;
    readonly trustedBotLogin?: string;
};

export function prepareLanguageAdaptationInput(
    commentBody: string,
    trustedBotLogin: string,
): LanguageAdaptationInput {
    const parsed = parseCopilotCommand(commentBody);
    if (parsed.kind === 'command') {
        return Object.freeze({
            kind: 'command',
            prose: parsed.command.arguments.join(' ').trim(),
            commandName: parsed.command.name,
        });
    }
    if (trustedBotLogin.trim()) {
        const normalizedBotLogin = trustedBotLogin.trim().replace(/^@/u, '');
        return Object.freeze({
            kind: 'mention',
            prose: extractMentionQuestion(commentBody, normalizedBotLogin),
            trustedBotLogin: normalizedBotLogin,
        });
    }
    return Object.freeze({ kind: 'plain', prose: commentBody.trim() });
}

export function rebuildAdaptedComment(input: LanguageAdaptationInput, adaptedText: string): string {
    const safeText = sanitizeAgentMarkdown(adaptedText, MAX_TRANSLATED_COMMENT_LENGTH).trim();
    if (input.kind === 'command' && input.commandName) {
        return `/copilot ${input.commandName}${safeText ? ` ${safeText}` : ''}`;
    }
    if (input.kind === 'mention' && input.trustedBotLogin) {
        return `@${input.trustedBotLogin}${safeText ? ` ${safeText}` : ''}`;
    }
    return safeText;
}

export function hasTranslatedCommentMarker(body: string | null | undefined): boolean {
    return typeof body === 'string'
        && (body.includes(TRANSLATED_COMMENT_MARKER) || body.includes(LEGACY_TRANSLATED_COMMENT_MARKER));
}

/**
 * Validates and composes a translation without allowing the model output or
 * quoted source comment to create GitHub mentions, commands, or HTML markers.
 */
export function composeTranslatedComment(
    translatedValue: unknown,
    originalComment: string,
): TranslationPublication | undefined {
    if (typeof translatedValue !== 'string') return undefined;
    const translated = translatedValue.trim();
    if (!translated || hasTranslatedCommentMarker(translated)) return undefined;

    const boundedTranslated = createUntrustedContent(
        translated,
        'agent.translation.output',
        MAX_TRANSLATED_COMMENT_LENGTH,
    ).text;
    if (!boundedTranslated.trim()) return undefined;

    const safeTranslated = sanitizeAgentMarkdown(boundedTranslated, MAX_TRANSLATED_COMMENT_LENGTH);
    const safeOriginal = createUntrustedContent(
        escapeHtml(originalComment),
        'github.comment.original.escaped',
        MAX_ESCAPED_ORIGINAL_LENGTH,
    ).text;
    return {
        translatedText: safeTranslated,
        commentBody: [
            safeTranslated,
            '',
            '<details>',
            '<summary>Translated request and original</summary>',
            '',
            '<pre>',
            safeOriginal,
            '</pre>',
            '</details>',
            '',
            TRANSLATED_COMMENT_MARKER,
            '',
        ].join('\n'),
    };
}

export function appendTranslationContext(response: string, publication: TranslationPublication | undefined): string {
    if (!publication) return response;
    return `${response.trim()}\n\n${publication.commentBody}`;
}
