import { IMMUTABLE_PROGRESS_PROFILE, progressUnitLimit } from './progress_inventory_profile_policy';
import { progressInventoryError } from './progress_inventory_error_policy';
import { progressRecoveryError } from './progress_content_evidence_policy';
import { ProgressCapacityFailure } from '../errors/progress_capacity_failure';
import type { ProgressCapacityInput, ProgressCapacityPhase } from '../../domain/progress_capacity_diagnostic';
import type { ProgressEvidenceProfile, ProgressDiffEvidence, ProgressDiffPartition, ProgressDiffChange } from '../ports/progress_diff_query_ports';

export const MAX_PROGRESS_EVIDENCE_BYTES = 256_000;
export const MAX_PROGRESS_PARTITIONS = 16;
export const MAX_FRAMED_PROGRESS_PARTITIONS = MAX_PROGRESS_PARTITIONS * 4;
export type { ProgressDiffChange } from '../ports/progress_diff_query_ports';

export function progressEvidenceTooLarge(input: ProgressCapacityInput): ProgressCapacityFailure {
    return new ProgressCapacityFailure(input);
}

export function invalidProgressCapacityAllocation(phase: ProgressCapacityPhase, allocation?: number, maximum?: number): ProgressCapacityFailure {
    if (phase === 'aggregate' && Number.isSafeInteger(allocation) && allocation! >= 0
        && Number.isSafeInteger(maximum) && maximum! >= 1 && (allocation! < 1 || allocation! > maximum!)) {
        return progressEvidenceTooLarge({ phase, dimension: 'aggregate-allocation-bytes', observedCount: allocation!,
            supportedLimit: allocation === 0 ? 1 : maximum!, bound: allocation === 0 ? 'minimum' : 'maximum' });
    }
    return progressEvidenceTooLarge({ phase, dimension: 'invalid-allocation', observedCount: 'unavailable', supportedLimit: 'unavailable',
        countKind: 'unavailable', bound: 'unavailable' });
}

export function serializeProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[]): string {
    return JSON.stringify({ kind: 'pinned-branch-comparison', baseSha, headSha, changes });
}

/** Losslessly partitions complete, adapter-validated file facts. No source file is omitted. */
export function partitionProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[], profile: 'immutable-tree-v1'): Extract<ProgressDiffEvidence, { kind: 'partitioned' }>;
export function partitionProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[], profile?: ProgressEvidenceProfile): ProgressDiffEvidence;
export function partitionProgressDiff(baseSha: string, headSha: string, changes: readonly ProgressDiffChange[], profile?: ProgressEvidenceProfile): ProgressDiffEvidence {
    const serialize = (files: readonly ProgressDiffChange[]) => serializeProgressDiff(baseSha, headSha, files);
    const unitMode = changes.some(change => change.unitId !== undefined);
    if (profile === 'immutable-tree-v1' && (!unitMode || changes.some(change => !change.unitId))) throw progressInventoryError('inventory', changes.length, 0, changes.map(change => change.path));
    if (profile === 'immutable-tree-v1' && changes.length > progressUnitLimit(profile)) throw progressInventoryError('units', changes.length, progressUnitLimit(profile), changes.map(change => change.path));
    if (unitMode && changes.length > progressUnitLimit(profile)) throw progressEvidenceTooLarge({ phase: 'source', dimension: 'source-unit-count',
        observedCount: changes.length, supportedLimit: progressUnitLimit(profile) });
    if (unitMode && (changes.some(change => !change.unitId)
        || new Set(changes.map(change => change.unitId)).size !== changes.length)) {
        throw progressRecoveryError('complete evidence unit inventory exceeds its budget or is ambiguous', changes.map(change => change.path), true);
    }
    const groups: ProgressDiffChange[][] = [];
    let current: ProgressDiffChange[] = [];
    for (const change of changes) {
        const unitBytes = Buffer.byteLength(serialize([change]), 'utf8');
        if (unitBytes > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge({ phase: 'source', dimension: 'source-unit-bytes',
            observedCount: unitBytes, supportedLimit: MAX_PROGRESS_EVIDENCE_BYTES });
        if ((profile === 'immutable-tree-v1' && current.length === IMMUTABLE_PROGRESS_PROFILE.partUnits) || Buffer.byteLength(serialize([...current, change]), 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) {
            groups.push(current);
            const partLimit = profile ? MAX_FRAMED_PROGRESS_PARTITIONS : MAX_PROGRESS_PARTITIONS;
            if (groups.length >= partLimit) throw progressEvidenceTooLarge({ phase: 'source', dimension: 'source-part-count',
                observedCount: groups.length + 1, supportedLimit: partLimit, countKind: 'at-least' });
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
        partitions: partitions.map(part => ({ id: part.id, paths: part.paths, ...(part.units ? { units: profile === 'immutable-tree-v1' ? part.units.map(unit => ({ id: unit.id, path: unit.path })) : part.units } : {}) })) });
    const manifestBytes = Buffer.byteLength(manifest, 'utf8');
    if (manifestBytes > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge({ phase: 'source', dimension: 'source-manifest-bytes',
        observedCount: manifestBytes, supportedLimit: MAX_PROGRESS_EVIDENCE_BYTES });
    return Object.freeze({ kind: 'partitioned', baseSha, headSha, evidence: manifest, partitions });
}
