import {
    createUntrustedContent,
    DEFAULT_UNTRUSTED_CONTENT_LIMIT,
} from '../../domain/security/untrusted_content';
import { escapeHtml, sanitizeAgentMarkdown } from './github_comment_publication_policy';
import {
    copilotCommandAcceptsAdaptableProse,
    parseCopilotCommand,
    type CopilotCommandName,
} from '../../domain/copilot_command';
import { extractMentionQuestion } from '../usecases/steps/common/think_input_policy';
import type { PublicationMessageCatalog } from './publication_message_catalog';

/** Opaque marker: it is metadata, not an instruction for another agent. */
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
    readonly protectedOperands?: readonly Readonly<{ placeholder: string; value: string }>[];
};

const TECHNICAL_OPERAND_PATTERNS = Object.freeze([
    /`[^`\r\n]+`/u.source,
    /https?:\/\/[^\s<>()]+/u.source,
    /"(?:\\.|[^"\\\r\n])+"/u.source,
    /'(?:\\.|[^'\\\r\n])+'/u.source,
    /(?<![\p{L}\p{N}_])--?[A-Za-z0-9][A-Za-z0-9-]*(?:=[^\s]+)?/u.source,
    /(?<![\p{L}\p{N}_<])(?:\.{0,2}\/|[A-Za-z0-9_.-]+\/)[A-Za-z0-9_./-]+/u.source,
    /(?<![\p{L}\p{N}_./-])(?:\.[A-Za-z0-9][A-Za-z0-9_.-]*|[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+|Dockerfile|Makefile|Gemfile|Procfile)(?![\p{L}\p{N}_./-])/u.source,
    /(?<![\p{L}\p{N}_#-])(?:#\d+|GH-\d+)(?![\p{L}\p{N}_-])/u.source,
    /(?<![\p{L}\p{N}_-])(?:HEAD(?:[~^]\d*)?|main|master|develop|development|trunk)(?![\p{L}\p{N}_-])/u.source,
    /(?<![\p{L}\p{N}_])v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?(?![\p{L}\p{N}_.-])/u.source,
    /(?<![0-9A-Fa-f])[0-9A-Fa-f]{7,64}(?![0-9A-Fa-f])/u.source,
]);
const PROTECTED_OPERAND_PATTERN = technicalOperandPattern();
const GENERATED_OPERAND_PATTERN = technicalOperandPattern();
const OPERAND_PLACEHOLDER_PATTERN = /COPILOT_OPERAND_\d+_TOKEN/gu;
const OPERAND_ADJACENCY_PATTERN = /[\p{L}\p{N}_./:@#%+?=&-]/u;

export function prepareLanguageAdaptationInput(
    commentBody: string,
    trustedBotLogin: string,
): LanguageAdaptationInput {
    const parsed = parseCopilotCommand(commentBody);
    if (parsed.kind === 'command') {
        return languageAdaptationInput({
            kind: 'command',
            prose: parsed.command.arguments.join(' ').trim(),
            commandName: parsed.command.name,
        }, !copilotCommandAcceptsAdaptableProse(parsed.command.name));
    }
    if (trustedBotLogin.trim()) {
        const normalizedBotLogin = trustedBotLogin.trim().replace(/^@/u, '');
        return languageAdaptationInput({
            kind: 'mention',
            prose: extractMentionQuestion(commentBody, normalizedBotLogin),
            trustedBotLogin: normalizedBotLogin,
        });
    }
    return languageAdaptationInput({ kind: 'plain', prose: commentBody.trim() });
}

export function restoreLanguageAdaptationOutput(
    input: LanguageAdaptationInput,
    adaptedText: string,
): string | undefined {
    const operands = input.protectedOperands ?? [];
    const commandProtectsEveryToken = input.kind === 'command'
        && input.commandName !== undefined
        && !copilotCommandAcceptsAdaptableProse(input.commandName);
    if (operands.some((operand, index) => (
        operand.placeholder !== `COPILOT_OPERAND_${index}_TOKEN`
        || !operand.value
        || (!commandProtectsEveryToken && !isTechnicalOperand(operand.value))
    ))) return undefined;
    if (matches(OPERAND_PLACEHOLDER_PATTERN, adaptedText)
        && operands.length === 0) return undefined;
    if (matches(GENERATED_OPERAND_PATTERN, adaptedText)) return undefined;

    let restored = adaptedText;
    let previousPlaceholderIndex = -1;
    for (const operand of operands) {
        const placeholderIndex = exactPlaceholderIndex(restored, operand.placeholder);
        if (placeholderIndex === undefined || placeholderIndex <= previousPlaceholderIndex) return undefined;
        previousPlaceholderIndex = placeholderIndex;
        restored = restored.replace(operand.placeholder, operand.value);
    }
    if (matches(OPERAND_PLACEHOLDER_PATTERN, restored)) return undefined;
    const restoredOperands = matchingValues(PROTECTED_OPERAND_PATTERN, restored);
    const expectedTechnicalOperands = operands
        .map(operand => operand.value)
        .filter(isTechnicalOperand);
    if (restoredOperands.length !== expectedTechnicalOperands.length
        || restoredOperands.some((value, index) => value !== expectedTechnicalOperands[index])) return undefined;
    return restored;
}

export function rebuildAdaptedComment(input: LanguageAdaptationInput, adaptedText: string): string | undefined {
    const restored = restoreLanguageAdaptationOutput(input, adaptedText);
    if (restored === undefined) return undefined;
    const safeText = sanitizeAgentMarkdown(restored, MAX_TRANSLATED_COMMENT_LENGTH).trim();
    if (input.kind === 'command' && input.commandName) {
        return `/copilot ${input.commandName}${safeText ? ` ${safeText}` : ''}`;
    }
    if (input.kind === 'mention' && input.trustedBotLogin) {
        return `@${input.trustedBotLogin}${safeText ? ` ${safeText}` : ''}`;
    }
    return safeText;
}

function languageAdaptationInput(
    input: Omit<LanguageAdaptationInput, 'protectedOperands'>,
    protectEveryToken = false,
): LanguageAdaptationInput {
    const operands: Array<Readonly<{ placeholder: string; value: string }>> = [];
    const pattern = protectEveryToken ? /\S+/gu : PROTECTED_OPERAND_PATTERN;
    const prose = input.prose.replace(pattern, value => {
        const placeholder = `COPILOT_OPERAND_${operands.length}_TOKEN`;
        operands.push(Object.freeze({ placeholder, value }));
        return placeholder;
    });
    pattern.lastIndex = 0;
    return Object.freeze({
        ...input,
        prose,
        ...(operands.length > 0 ? { protectedOperands: Object.freeze(operands) } : {}),
    });
}

function matches(pattern: RegExp, value: string): boolean {
    pattern.lastIndex = 0;
    const matched = pattern.test(value);
    pattern.lastIndex = 0;
    return matched;
}

function exactPlaceholderIndex(value: string, placeholder: string): number | undefined {
    const index = value.indexOf(placeholder);
    if (index < 0 || index !== value.lastIndexOf(placeholder)) return undefined;
    const before = index > 0 ? value[index - 1] : '';
    const afterIndex = index + placeholder.length;
    const after = afterIndex < value.length ? value[afterIndex] : '';
    return !OPERAND_ADJACENCY_PATTERN.test(before) && !OPERAND_ADJACENCY_PATTERN.test(after)
        ? index
        : undefined;
}

function matchingValues(pattern: RegExp, value: string): readonly string[] {
    pattern.lastIndex = 0;
    const values = [...value.matchAll(pattern)].map(match => match[0]);
    pattern.lastIndex = 0;
    return values;
}

function isTechnicalOperand(value: string): boolean {
    const pattern = technicalOperandPattern(true);
    return pattern.test(value);
}

function technicalOperandPattern(anchored = false): RegExp {
    const source = TECHNICAL_OPERAND_PATTERNS.join('|');
    return new RegExp(anchored ? `^(?:${source})$` : source, anchored ? 'u' : 'gu');
}

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
