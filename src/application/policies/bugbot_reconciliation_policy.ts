import type {
    BugbotFinding,
    ExistingByFindingId,
} from '../usecases/steps/commit/bugbot/types';

/**
 * Accepts a model's resolution claims only when they refer to an existing
 * finding and no active finding with the same id or local fingerprint remains.
 * This prevents a stale or injected response from resolving a live finding.
 */
export function reconcileResolvedFindingIds(
    resolvedFindingIds: ReadonlySet<string>,
    existingByFindingId: ExistingByFindingId,
    activeFindings: readonly BugbotFinding[],
): Set<string> {
    const activeIds = new Set(activeFindings.map((finding) => finding.id));
    const activeFingerprints = new Set(activeFindings.flatMap((finding) => finding.fingerprint ? [finding.fingerprint] : []));
    return new Set([...resolvedFindingIds].filter((findingId) => {
        const existing = existingByFindingId[findingId];
        if (!existing || activeIds.has(findingId)) return false;
        const fingerprint = existing.issue?.fingerprint ?? existing.pullRequest?.fingerprint;
        return !fingerprint || !activeFingerprints.has(fingerprint);
    }));
}
