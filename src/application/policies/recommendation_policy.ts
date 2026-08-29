import { createHash } from 'node:crypto';

export const NO_NEW_RECOMMENDATIONS = 'NO_NEW_RECOMMENDATIONS';
export const MAX_STORED_RECOMMENDATION_LENGTH = 12000;

/**
 * Copilot keeps internal state in hidden HTML blocks in the issue body. That
 * state is operational metadata, not part of the issue to be analysed.
 */
const MANAGED_CONTENT_BLOCK_PATTERN = /<!--\s*copilot-([\w-]+)-start(?:\s*-->)?[\s\S]*?copilot-\1-end\s*-->/gi;

export function getVisibleIssueDescription(description: string): string {
    return description.replace(MANAGED_CONTENT_BLOCK_PATTERN, '').trim();
}

export function createIssueDescriptionFingerprint(description: string): string {
    return createSha256(normalizeForFingerprint(description));
}

export function createRecommendationFingerprint(recommendation: string): string {
    return createSha256(normalizeForFingerprint(recommendation));
}

export function isNoNewRecommendation(response: string): boolean {
    const withoutCodeFence = response
        .trim()
        .replace(/^```(?:markdown|text)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    return withoutCodeFence.toUpperCase() === NO_NEW_RECOMMENDATIONS;
}

export function limitStoredRecommendation(recommendation: string): string {
    if (recommendation.length <= MAX_STORED_RECOMMENDATION_LENGTH) return recommendation;

    return `${recommendation.slice(0, MAX_STORED_RECOMMENDATION_LENGTH)}\n\n[Recommendation truncated for issue metadata storage.]`;
}

function normalizeForFingerprint(value: string): string {
    return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function createSha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
