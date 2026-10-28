import { MAX_PROGRESS_EVIDENCE_UNITS, progressRecoveryError } from './progress_content_evidence_policy';
import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffEvidence, ProgressDiffPartition, ProgressDiffChange } from '../ports/progress_diff_query_ports';

export const MAX_PROGRESS_EVIDENCE_BYTES = 256_000;
export const MAX_PROGRESS_PARTITIONS = 16;
export type { ProgressDiffChange } from '../ports/progress_diff_query_ports';

export function progressEvidenceTooLarge(): ApplicationError {
    return new ApplicationError('validation.evidence-too-large', 'Progress evidence exceeds a fixed analysis budget. Existing progress was retained; retrying the same comparison cannot resolve this limit.');
}

export function serializeProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[]): string {
    return JSON.stringify({ kind: 'pinned-branch-comparison', baseSha, headSha, changes });
}

/** Losslessly partitions complete, adapter-validated file facts. No source file is omitted. */
export function partitionProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[]): ProgressDiffEvidence {
    const serialize = (files: readonly ProgressDiffChange[]) => serializeProgressDiff(baseSha, headSha, files);
    const unitMode = changes.some(change => change.unitId !== undefined);
    if (unitMode && (changes.length > MAX_PROGRESS_EVIDENCE_UNITS || changes.some(change => !change.unitId)
        || new Set(changes.map(change => change.unitId)).size !== changes.length)) {
        throw progressRecoveryError('complete evidence unit inventory exceeds its budget or is ambiguous', changes.map(change => change.path), true);
    }
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
    if (groups.length === 1 && !unitMode) return Object.freeze({ kind: 'single', baseSha, headSha, evidence: serialize(current) });
    const partitions: readonly ProgressDiffPartition[] = Object.freeze(groups.map((files, index) => Object.freeze({
        id: `progress-${index + 1}-of-${groups.length}`,
        paths: Object.freeze([...new Set(files.map(file => file.path))]),
        ...(unitMode ? { units: Object.freeze(files.map(file => {
            const content = file.recoveredContent
                ? Object.freeze(Object.fromEntries(Object.entries(file.recoveredContent).filter(([key]) => key !== 'text')))
                : undefined;
            return Object.freeze({ id: file.unitId!, path: file.path, ...(content ? { content } : {}) });
        })) } : {}),
        evidence: serialize(files),
    })));
    const manifest = JSON.stringify({ kind: 'partitioned-branch-comparison', baseSha, headSha,
        partitions: partitions.map(part => ({ id: part.id, paths: part.paths, ...(part.units ? { units: part.units } : {}) })) });
    if (Buffer.byteLength(manifest, 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge();
    return Object.freeze({ kind: 'partitioned', baseSha, headSha, evidence: manifest, partitions });
}
