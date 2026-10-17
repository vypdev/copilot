import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffEvidence, ProgressDiffPartition } from '../ports/progress_diff_query_ports';

export const MAX_PROGRESS_EVIDENCE_BYTES = 256_000;
export const MAX_PROGRESS_PARTITIONS = 16;
export interface ProgressDiffChange {
    readonly path: string;
    readonly status: string;
    readonly additions: number;
    readonly deletions: number;
    readonly patch?: string;
    readonly evidence?: 'generated-metadata-only';
}

export function progressEvidenceTooLarge(): ApplicationError {
    return new ApplicationError('validation.evidence-too-large', 'Progress evidence exceeds a fixed analysis budget. Existing progress was retained; retrying the same comparison cannot resolve this limit.');
}

/** Losslessly partitions complete, adapter-validated file facts. No source file is omitted. */
export function partitionProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[]): ProgressDiffEvidence {
    const serialize = (files: readonly ProgressDiffChange[]) => JSON.stringify({ kind: 'pinned-branch-comparison', baseSha, headSha, changes: files });
    const groups: ProgressDiffChange[][] = [];
    let current: ProgressDiffChange[] = [];
    for (const change of changes) {
        if (Buffer.byteLength(serialize([change]), 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge();
        if (Buffer.byteLength(serialize([...current, change]), 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) {
            groups.push(current);
            if (groups.length >= MAX_PROGRESS_PARTITIONS) throw progressEvidenceTooLarge();
            current = [];
        }
        current.push(change);
    }
    groups.push(current);
    if (groups.length === 1) return Object.freeze({ kind: 'single', baseSha, headSha, evidence: serialize(current) });
    const partitions: readonly ProgressDiffPartition[] = Object.freeze(groups.map((files, index) => Object.freeze({
        id: `progress-${index + 1}-of-${groups.length}`,
        paths: Object.freeze(files.map(file => file.path)),
        evidence: serialize(files),
    })));
    const manifest = JSON.stringify({ kind: 'partitioned-branch-comparison', baseSha, headSha,
        partitions: partitions.map(part => ({ id: part.id, paths: part.paths })) });
    if (Buffer.byteLength(manifest, 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge();
    return Object.freeze({ kind: 'partitioned', baseSha, headSha, evidence: manifest, partitions });
}
