import {
    createUntrustedContent,
    DEFAULT_UNTRUSTED_CONTENT_LIMIT,
} from '../../domain/security/untrusted_content';
import { escapeHtml, sanitizeAgentMarkdown } from './github_comment_publication_policy';
import { parseCopilotCommand, type CopilotCommandName } from '../../domain/copilot_command';
import { extractMentionQuestion } from '../usecases/steps/common/think_input_policy';
import type { PublicationMessageCatalog } from './publication_message_catalog';

/** Opaque marker: it is metadata, not an instruction for another agent. */
export const LEGACY_TRANSLATED_COMMENT_MARKER = '<!-- copilot:translated-comment:v2 -->';
export const TRANSLATED_COMMENT_MARKER = '<!-- copilot:request-translation schema="3"';

const MAX_TRANSLATED_COMMENT_LENGTH = DEFAULT_UNTRUSTED_CONTENT_LIMIT;
const MAX_ESCAPED_ORIGINAL_LENGTH = 40_000;

export type TranslationPublication = {
    readonly translatedText: string;
    readonly originalText: string;
    readonly sourceLocale: string;
    readonly targetLocale: string;
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
    locale: Readonly<{ sourceLocale?: string; targetLocale?: string }> = {},
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
    const boundedOriginal = createUntrustedContent(
        originalComment,
        'github.comment.original',
        MAX_ESCAPED_ORIGINAL_LENGTH,
    ).text;
    const targetLocale = canonicalLocaleOr(locale.targetLocale, 'en-US');
    const sourceLocale = canonicalLocaleOr(locale.sourceLocale, 'und');
    return {
        translatedText: safeTranslated,
        originalText: boundedOriginal,
        sourceLocale,
        targetLocale,
    };
}

/** Renders localized provenance only at the publication boundary. */
export function renderTranslationContext(
    publication: TranslationPublication,
    catalog: PublicationMessageCatalog,
): string {
    const translatedText = sanitizeAgentMarkdown(
        createUntrustedContent(
            publication.translatedText,
            'publication.translation.interpreted',
            MAX_TRANSLATED_COMMENT_LENGTH,
        ).text,
        MAX_TRANSLATED_COMMENT_LENGTH,
    ).trim();
    const boundedOriginalText = createUntrustedContent(
        publication.originalText,
        'publication.translation.original',
        MAX_ESCAPED_ORIGINAL_LENGTH,
    ).text;
    const escapedOriginalText = neutralizeQuotedOriginal(createUntrustedContent(
        escapeHtml(boundedOriginalText),
        'publication.translation.original.escaped',
        MAX_ESCAPED_ORIGINAL_LENGTH,
    ).text).trim();
    if (!translatedText || !escapedOriginalText) return '';

    const sourceLocale = canonicalLocaleOr(publication.sourceLocale, 'und');
    const targetLocale = canonicalLocaleOr(publication.targetLocale, 'en-US');
    const marker = `${TRANSLATED_COMMENT_MARKER} source="${sourceLocale}" target="${targetLocale}" -->`;
    return [
        '<details>',
        `<summary>${escapeHtml(catalog.translation.summary(displayLanguage(sourceLocale, catalog.locale)))}</summary>`,
        '',
        `**${catalog.translation.interpretedRequest}**`,
        '',
        translatedText,
        '',
        `**${catalog.translation.originalRequest}**`,
        '',
        '<pre>',
        escapedOriginalText,
        '</pre>',
        '</details>',
        '',
        marker,
    ].join('\n');
}

function displayLanguage(sourceLocale: string, targetLocale: string): string {
    if (sourceLocale === 'und') return sourceLocale;
    try {
        return new Intl.DisplayNames([targetLocale], { type: 'language' }).of(sourceLocale) ?? sourceLocale;
    } catch {
        return sourceLocale;
    }
}

function canonicalLocaleOr(value: string | undefined, fallback: string): string {
    if (!value?.trim()) return fallback;
    try {
        return new Intl.Locale(value).toString();
    } catch {
        return fallback;
    }
}

function neutralizeQuotedOriginal(value: string): string {
    return value
        .replace(/[\u202A-\u202E\u2066-\u2069]/gu, '')
        .replace(/(^|\n)([ \t]*)\/(?!\/)/gu, '$1$2\u200b/')
        .replace(/@(?=[a-zA-Z0-9][a-zA-Z0-9-])/gu, '@\u200b');
}
