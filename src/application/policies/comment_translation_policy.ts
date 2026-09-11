import {
    createUntrustedContent,
    DEFAULT_UNTRUSTED_CONTENT_LIMIT,
} from '../../domain/security/untrusted_content';
import { escapeHtml, sanitizeAgentMarkdown } from './github_comment_publication_policy';

/** Opaque marker: it is metadata, not an instruction for another agent. */
export const TRANSLATED_COMMENT_MARKER = '<!-- copilot:translated-comment:v2 -->';

const MAX_TRANSLATED_COMMENT_LENGTH = DEFAULT_UNTRUSTED_CONTENT_LIMIT;
const MAX_ESCAPED_ORIGINAL_LENGTH = 40_000;

export type TranslationPublication = {
    readonly translatedText: string;
    readonly commentBody: string;
};

export function hasTranslatedCommentMarker(body: string | null | undefined): boolean {
    return typeof body === 'string'
        && body.includes(TRANSLATED_COMMENT_MARKER);
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
            '<summary>Original comment (untrusted content)</summary>',
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
