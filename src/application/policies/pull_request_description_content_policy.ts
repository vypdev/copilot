import { sanitizeAgentMarkdown } from './github_comment_publication_policy';

export const MAX_PULL_REQUEST_DESCRIPTION_LENGTH = 12_000;

const CONTENT_KEYS = Object.freeze([
    'outputLocale',
    'overview',
    'whatChangedHeading',
    'changes',
    'validationHeading',
    'validation',
    'reviewNotesHeading',
    'reviewNotes',
    'closesLinkedIssue',
]);
const SORTED_CONTENT_KEYS = Object.freeze([...CONTENT_KEYS].sort());

export type PullRequestDescriptionContent = {
    readonly overview: string;
    readonly whatChangedHeading: string;
    readonly changes: readonly string[];
    readonly validationHeading: string;
    readonly validation: readonly string[];
    readonly reviewNotesHeading: string | null;
    readonly reviewNotes: readonly string[] | null;
    readonly closesLinkedIssue: boolean;
};

export type PullRequestDescriptionContentResult =
    | { readonly kind: 'valid'; readonly markdown: string }
    | {
        readonly kind: 'invalid';
        readonly reason: 'shape' | 'sentence-count' | 'unsafe-markdown' | 'duplicate-item' | 'body-too-long';
    };

/** Turns structured, untrusted agent content into one predictable review surface. */
export function renderPullRequestDescriptionContent(
    payload: Readonly<Record<string, unknown>>,
    targetLocale: string,
    linkedIssueNumber?: number,
): PullRequestDescriptionContentResult {
    const parsed = parseContent(payload);
    if (!parsed) return { kind: 'invalid', reason: 'shape' };
    const safeLinkedIssueNumber = typeof linkedIssueNumber === 'number'
        && Number.isSafeInteger(linkedIssueNumber)
        && linkedIssueNumber > 0
        ? linkedIssueNumber
        : undefined;
    if (parsed.closesLinkedIssue && safeLinkedIssueNumber === undefined) {
        return { kind: 'invalid', reason: 'shape' };
    }
    const rawContent = [
        parsed.overview,
        parsed.whatChangedHeading,
        parsed.validationHeading,
        ...parsed.changes,
        ...parsed.validation,
        ...(parsed.reviewNotesHeading ? [parsed.reviewNotesHeading] : []),
        ...(parsed.reviewNotes ?? []),
    ];
    if (rawContent.some(hasForbiddenMarkdown)) {
        return { kind: 'invalid', reason: 'unsafe-markdown' };
    }

    const overview = sanitizeBlock(parsed.overview);
    const whatChangedHeading = sanitizeInline(parsed.whatChangedHeading);
    const validationHeading = sanitizeInline(parsed.validationHeading);
    const changes = parsed.changes.map(sanitizeInline);
    const validation = parsed.validation.map(sanitizeInline);
    const reviewNotesHeading = parsed.reviewNotesHeading === null
        ? null
        : sanitizeInline(parsed.reviewNotesHeading);
    const reviewNotes = parsed.reviewNotes?.map(sanitizeInline) ?? null;

    const allContent = [
        overview,
        whatChangedHeading,
        validationHeading,
        ...changes,
        ...validation,
        ...(reviewNotesHeading ? [reviewNotesHeading] : []),
        ...(reviewNotes ?? []),
    ];
    if (allContent.some(value => !value || hasForbiddenMarkdown(value))) {
        return { kind: 'invalid', reason: 'unsafe-markdown' };
    }
    if (sentenceCount(overview, targetLocale) > 3) {
        return { kind: 'invalid', reason: 'sentence-count' };
    }
    if (hasDuplicates(changes, targetLocale)
        || hasDuplicates(validation, targetLocale)
        || (reviewNotes && hasDuplicates(reviewNotes, targetLocale))) {
        return { kind: 'invalid', reason: 'duplicate-item' };
    }

    const sections = [
        overview,
        `## ${whatChangedHeading}\n\n${renderList(changes)}`,
        `## ${validationHeading}\n\n${renderList(validation)}`,
    ];
    if (reviewNotesHeading && reviewNotes) {
        sections.push(`## ${reviewNotesHeading}\n\n${renderList(reviewNotes)}`);
    }
    if (parsed.closesLinkedIssue && safeLinkedIssueNumber !== undefined) {
        sections.push(`Closes #${safeLinkedIssueNumber}`);
    }

    const markdown = sections.join('\n\n');
    return markdown.length <= MAX_PULL_REQUEST_DESCRIPTION_LENGTH
        ? { kind: 'valid', markdown }
        : { kind: 'invalid', reason: 'body-too-long' };
}

function parseContent(payload: Readonly<Record<string, unknown>>): PullRequestDescriptionContent | undefined {
    const keys = Object.keys(payload).sort();
    if (keys.length !== CONTENT_KEYS.length
        || keys.some((key, index) => key !== SORTED_CONTENT_KEYS[index])) {
        return undefined;
    }
    const changes = stringArray(payload.changes, 2, 6);
    const validation = stringArray(payload.validation, 1, 8);
    if (typeof payload.overview !== 'string'
        || payload.overview.length > 1_500
        || typeof payload.whatChangedHeading !== 'string'
        || payload.whatChangedHeading.length > 100
        || typeof payload.validationHeading !== 'string'
        || payload.validationHeading.length > 100
        || !changes
        || !validation
        || typeof payload.closesLinkedIssue !== 'boolean') {
        return undefined;
    }
    let reviewNotes: readonly string[] | null;
    let reviewNotesHeading: string | null;
    if (payload.reviewNotes === null) {
        if (payload.reviewNotesHeading !== null) return undefined;
        reviewNotes = null;
        reviewNotesHeading = null;
    } else {
        const parsedReviewNotes = stringArray(payload.reviewNotes, 1, 4);
        if (!parsedReviewNotes
            || typeof payload.reviewNotesHeading !== 'string'
            || payload.reviewNotesHeading.length > 100) return undefined;
        reviewNotes = parsedReviewNotes;
        reviewNotesHeading = payload.reviewNotesHeading;
    }
    return {
        overview: payload.overview,
        whatChangedHeading: payload.whatChangedHeading,
        changes,
        validationHeading: payload.validationHeading,
        validation,
        reviewNotesHeading,
        reviewNotes,
        closesLinkedIssue: payload.closesLinkedIssue,
    };
}

function stringArray(value: unknown, minimum: number, maximum: number): readonly string[] | undefined {
    return Array.isArray(value)
        && value.length >= minimum
        && value.length <= maximum
        && value.every(item => typeof item === 'string' && item.length <= 1_000)
        ? value
        : undefined;
}

function sanitizeBlock(value: string): string {
    return sanitizeAgentMarkdown(value, 1_500).trim().replace(/\s*\n\s*/gu, ' ');
}

function sanitizeInline(value: string): string {
    return sanitizeAgentMarkdown(value, 1_000)
        .trim()
        .replace(/^[-*+]\s+/u, '')
        .replace(/\s+/gu, ' ');
}

function hasForbiddenMarkdown(value: string): boolean {
    return /\p{Extended_Pictographic}/u.test(value)
        || /(^|\n)\s*#{1,6}\s/u.test(value)
        || /(^|\n)\s*(?:-{3,}|\*{3,}|_{3,})\s*($|\n)/u.test(value)
        || /(^|\n)\s*(?:[-*+]\s+)?\[[ xX]\]\s/u.test(value);
}

function sentenceCount(value: string, locale: string): number {
    const Segmenter = (Intl as typeof Intl & {
        Segmenter?: new (
            locales?: string | readonly string[],
            options?: { granularity: 'sentence' },
        ) => { segment(input: string): Iterable<{ segment: string }> };
    }).Segmenter;
    if (Segmenter) {
        return Array.from(new Segmenter(locale, { granularity: 'sentence' }).segment(value))
            .filter(part => part.segment.trim().length > 0)
            .length;
    }
    const terminalGroups = value.match(/[.!?。！？]+(?=\s|$)/gu)?.length ?? 0;
    return Math.max(1, terminalGroups);
}

function hasDuplicates(values: readonly string[], locale: string): boolean {
    const normalized = values.map(value => value.toLocaleLowerCase(locale).trim());
    return new Set(normalized).size !== normalized.length;
}

function renderList(values: readonly string[]): string {
    return values.map(value => `- ${value}`).join('\n');
}
