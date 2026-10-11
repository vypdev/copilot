import { getResultPayload, type Result } from '../../data/model/result';

export type InactivityResultCountsProjection =
    | { readonly status: 'absent' | 'invalid' }
    | { readonly status: 'valid'; readonly counts: Readonly<{ scanned: number; closed: number; skipped: number }> };

/** Projects scan evidence without exposing the capability's internal result or step prose. */
export function projectInactivityResultCounts(results: readonly Result[]): InactivityResultCountsProjection {
    const scans = results.filter(result => result.id === 'CloseInactiveIssuesUseCase');
    if (scans.length === 0) return { status: 'absent' };
    const payload = scans.length === 1 ? getResultPayload(scans[0].payload) : undefined;
    if (!payload || !isInactivityCount(payload.scanned) || !isInactivityCount(payload.closed)
        || !isInactivityCount(payload.skipped) || payload.closed + payload.skipped > payload.scanned) {
        return { status: 'invalid' };
    }
    return { status: 'valid', counts: {
        scanned: payload.scanned, closed: payload.closed, skipped: payload.skipped,
    } };
}

function isInactivityCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
