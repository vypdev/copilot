import { getResultPayload, type Result } from '../../data/model/result';

export interface StaleSourcePublicationOutcome {
    readonly reason: 'stale-source';
    readonly branch: string;
    readonly sourceHeadSha: string;
}

export interface PublicationOutcomePayload {
    readonly publicationOutcome: StaleSourcePublicationOutcome;
}

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
