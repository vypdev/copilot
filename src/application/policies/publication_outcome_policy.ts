import { getResultPayload, type Result } from '../../data/model/result';

export interface StaleSourcePublicationOutcome {
    readonly reason: 'stale-source';
    readonly branch: string;
    readonly sourceHeadSha: string;
}

export interface PublicationOutcomePayload {
    readonly publicationOutcome: StaleSourcePublicationOutcome;
}

export interface DuplicateCompactionPublicationOutcome {
    readonly reason: 'duplicate-deletion-forbidden';
    readonly compactedCommentIds: readonly number[];
    readonly compactedCount: number;
}

export interface PublicationCleanupPayload {
    readonly publicationCleanup: DuplicateCompactionPublicationOutcome;
}

const MAX_REPORTED_COMMENT_IDS = 20;

/** Builds bounded evidence for a commit-derived result that was intentionally suppressed. */
export function buildStaleSourcePublicationPayload(
    branch: string,
    sourceHeadSha: string,
): Readonly<PublicationOutcomePayload> {
    return Object.freeze({
        publicationOutcome: Object.freeze({
            reason: 'stale-source',
            branch,
            sourceHeadSha,
        }),
    });
}

export function hasStaleSourcePublicationOutcome(results: readonly Result[]): boolean {
    return results.some(result => {
        const payload = getResultPayload(result.payload);
        const outcome = getResultPayload(payload?.publicationOutcome);
        return outcome?.reason === 'stale-source';
    });
}

/** Builds bounded operator evidence for duplicates retained as compact pointers. */
export function buildDuplicateCompactionPublicationPayload(
    commentIds: readonly number[],
): Readonly<PublicationCleanupPayload> | undefined {
    const validIds = [...new Set(commentIds.filter(isPositiveInteger))].sort((left, right) => left - right);
    if (validIds.length === 0) return undefined;
    return Object.freeze({
        publicationCleanup: Object.freeze({
            reason: 'duplicate-deletion-forbidden',
            compactedCommentIds: Object.freeze(validIds.slice(0, MAX_REPORTED_COMMENT_IDS)),
            compactedCount: validIds.length,
        }),
    });
}

export function duplicateCompactionPublicationOutcomes(
    results: readonly Result[],
): readonly DuplicateCompactionPublicationOutcome[] {
    return Object.freeze(results.flatMap(result => {
        const payload = getResultPayload(result.payload);
        const cleanup = getResultPayload(payload?.publicationCleanup);
        if (cleanup?.reason !== 'duplicate-deletion-forbidden'
            || !isPositiveInteger(cleanup.compactedCount)
            || !Array.isArray(cleanup.compactedCommentIds)
            || cleanup.compactedCommentIds.length > MAX_REPORTED_COMMENT_IDS
            || cleanup.compactedCommentIds.length > cleanup.compactedCount
            || !areOrderedUniquePositiveIntegers(cleanup.compactedCommentIds)) {
            return [];
        }
        return [Object.freeze({
            reason: 'duplicate-deletion-forbidden' as const,
            compactedCommentIds: Object.freeze([...cleanup.compactedCommentIds]),
            compactedCount: cleanup.compactedCount,
        })];
    }));
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function areOrderedUniquePositiveIntegers(values: readonly unknown[]): values is readonly number[] {
    if (values.length === 0) return false;
    let previous: number | undefined;
    for (const value of values) {
        if (!isPositiveInteger(value) || previous !== undefined && value <= previous) return false;
        previous = value;
    }
    return true;
}
