import { isDeepStrictEqual } from 'node:util';
import type { ProgressCapacityContext } from '../../domain/progress_capacity_diagnostic';
import { isProgressEvidencePath } from '../../domain/progress_evidence_path';
import type { ProgressDiffEvidence, ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { MAX_FRAMED_PROGRESS_PARTITIONS, MAX_PROGRESS_EVIDENCE_BYTES } from './progress_diff_partition_policy';
import { validateFramedProgressEvidence } from './progress_evidence_protocol_policy';
import { progressComparisonCapacityContext } from './progress_capacity_context_policy';

const invalid = (): never => { throw new TypeError('Progress capacity source attribution is unavailable.'); };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function legacyPaths(evidence: string, baseSha: string, headSha: string, part?: ProgressDiffPartition): readonly string[] {
    if (typeof evidence !== 'string' || Buffer.byteLength(evidence, 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) return invalid();
    const value: unknown = JSON.parse(evidence);
    if (!record(value) || value.kind !== 'pinned-branch-comparison' || value.baseSha !== baseSha || value.headSha !== headSha
        || !Array.isArray(value.changes) || (part && value.changes.length === 0)
        || value.changes.some(change => !record(change) || !isProgressEvidencePath(change.path))) return invalid();
    const changes = value.changes as Record<string, unknown>[];
    const paths = [...new Set(changes.map(change => change.path as string))];
    if (part && !isDeepStrictEqual(part.paths, paths)) return invalid();
    if (part?.units ? !isDeepStrictEqual(part.units.map(unit => [unit.id, unit.path]), changes.map(change => [change.unitId, change.path]))
        : changes.some(change => change.unitId !== undefined)) return invalid();
    return paths;
}

/** The existing source owner must have admitted this complete semantic diff. */
export function progressCapacityDiffContext(diff: ProgressDiffEvidence, allPathReceiptsAccepted = false): ProgressCapacityContext {
    let required: readonly string[], manifestDigest: string | undefined;
    if (diff.kind === 'partitioned' && diff.protocol) {
        validateFramedProgressEvidence(diff, diff.protocol.assessmentContextDigest !== undefined);
        required = diff.protocol.requiredPaths; manifestDigest = diff.protocol.manifestDigest;
    } else if (diff.kind === 'partitioned') {
        if (!Array.isArray(diff.partitions) || diff.partitions.length === 0 || diff.partitions.length > MAX_FRAMED_PROGRESS_PARTITIONS) return invalid();
        required = [...new Set(diff.partitions.flatMap(part => legacyPaths(part.evidence, diff.baseSha, diff.headSha, part)))];
    } else {
        required = legacyPaths(diff.evidence, diff.baseSha, diff.headSha);
    }
    return progressComparisonCapacityContext({ baseSha: diff.baseSha, headSha: diff.headSha, requiredPaths: required,
        reviewedPaths: diff.kind === 'partitioned' && allPathReceiptsAccepted ? required : [], ...(manifestDigest === undefined ? {} : { manifestDigest }) });
}
