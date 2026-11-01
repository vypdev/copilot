import type { ProgressEvidenceProfile, ProgressRecoveryCounters } from '../ports/progress_diff_query_ports';

/** Closed host profile. Source capacity never grants model/prompt capacity. */
export const IMMUTABLE_PROGRESS_PROFILE = Object.freeze({
    version: 'immutable-tree-v1' as const, paths: 1_024, units: 4_096, partUnits: 512, frames: 16, minimumFactLength: 16,
    total: Object.freeze({ files: 1_024, bytes: 16_777_216, requests: 2_048, treeEntries: 200_000 }) satisfies ProgressRecoveryCounters,
});
export function progressUnitLimit(profile?: ProgressEvidenceProfile): number {
    return profile === 'immutable-tree-v1' ? IMMUTABLE_PROGRESS_PROFILE.units : 512;
}
