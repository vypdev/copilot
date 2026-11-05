import { IMMUTABLE_PROGRESS_PROFILE } from './progress_inventory_profile_policy';
import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffPartition, ProgressEvidenceProfile } from '../ports/progress_diff_query_ports';
import { progressResponseRejected, progressResponsePayload } from './progress_response_rejection_policy';
import type { ProgressResponseReason } from '../../domain/progress_response_diagnostic';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY } from './agent_output_locale_policy';
import { progressEvidenceTooLarge, invalidProgressCapacityAllocation } from './progress_diff_partition_policy';

// Leaves space inside the unchanged 512 KiB runtime prompt ceiling. The caller
// further subtracts the exact issue/prompt envelope before requesting facts.
export const MAX_PROGRESS_AGGREGATE_BYTES = 384_000;

export interface ProgressFileFacts {
    readonly path: string;
    readonly unitId?: string;
    readonly implemented: string;
    readonly remaining: string;
}
export function progressPartitionResponseSchema(partition: ProgressDiffPartition, factLimit = 600): Record<string, unknown> {
    const count = partition.units?.length ?? partition.paths.length;
    return {
        type: 'object', additionalProperties: false,
        properties: {
            outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
            partitionId: { type: 'string', enum: [partition.id] },
            files: { type: 'array', minItems: count, maxItems: count,
                items: { type: 'object', additionalProperties: false,
                    properties: { path: { type: 'string', enum: partition.paths },
                        ...(partition.units ? { unitId: { type: 'string', enum: partition.units.map(unit => unit.id) } } : {}),
                        implemented: { type: 'string', minLength: 1, maxLength: factLimit },
                        remaining: { type: 'string', minLength: 1, maxLength: factLimit } },
                    required: ['path', 'implemented', 'remaining', ...(partition.units ? ['unitId'] : [])] } },
        }, required: ['outputLocale', 'partitionId', 'files'],
    };
}

/** Complete exact-path facts only; model output cannot attest a build or a percentage. */
export function parseProgressPartitionFacts(response: unknown, partition: ProgressDiffPartition, locale: string, factLimit = 600): readonly ProgressFileFacts[] {
    const payload = progressResponsePayload(response, locale, 'partition', 'agent.failed');
    const reject = (reason: ProgressResponseReason, field: string): never => {
        throw progressResponseRejected({ phase: 'partition', reason, field, requirementId: 'none', sourceLineId: 'none' });
    };
    if (Object.keys(payload).sort().join(',') !== 'files,outputLocale,partitionId') reject('partition-shape-invalid', '$');
    if (payload.partitionId !== partition.id) reject('partition-id-invalid', '$.partitionId');
    if (!Array.isArray(payload.files) || payload.files.length !== (partition.units?.length ?? partition.paths.length)) reject('partition-files-incomplete', '$.files');
    const seen = new Set<string>();
    const facts = (payload.files as unknown[]).map((entry: unknown, index) => {
        const field = `$.files[${index}]`;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) reject('partition-file-invalid', field);
        const file = entry as Record<string, unknown>;
        const identity = partition.units ? file.unitId : file.path;
        const idField = `${field}.${partition.units ? 'unitId' : 'path'}`;
        if (Object.keys(file).sort().join(',') !== (partition.units ? 'implemented,path,remaining,unitId' : 'implemented,path,remaining')) reject('partition-file-invalid', field);
        if (typeof file.path !== 'string') reject('partition-unit-invalid', `${field}.path`);
        if (typeof identity !== 'string' || seen.has(identity as string)) reject('partition-unit-invalid', idField);
        const id = identity as string;
        if (partition.units) {
            const unit = partition.units.find(unit => unit.id === id);
            if (!unit) reject('partition-unit-invalid', idField);
            if (unit!.path !== file.path) reject('partition-unit-invalid', `${field}.path`);
        } else if (!partition.paths.includes(file.path as string)) reject('partition-unit-invalid', `${field}.path`);
        seen.add(id);
        for (const key of ['implemented', 'remaining'] as const) {
            const value = file[key];
            if (typeof value !== 'string' || value.trim().length === 0 || [...value].length > factLimit) reject('partition-facts-invalid', `${field}.${key}`);
        }
        return Object.freeze({ path: file.path as string, ...(partition.units ? { unitId: id } : {}), implemented: file.implemented as string, remaining: file.remaining as string });
    });
    return Object.freeze(facts);
}

function serializeProgressFacts(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], facts: readonly (readonly ProgressFileFacts[])[], profile?: ProgressEvidenceProfile): string {
    if (profile === 'immutable-tree-v1') {
        const paths = [...new Set(partitions.flatMap(part => part.paths))];
        const pathIndices = new Map(paths.map((path, index) => [path, index]));
        return JSON.stringify({ kind: 'complete-immutable-tree-analysis-v1', baseSha, headSha,
            warning: 'Untrusted model facts, not build, test or review attestation. Preserve uncertainty. Full source parts were supplied; summaries may miss details.',
            format: { facts: ['unitId', 'requiredPathIndex', 'implemented', 'remaining'] }, requiredPaths: paths,
            facts: facts.flat().map(file => [file.unitId, pathIndices.get(file.path), file.implemented, file.remaining]) });
    }
    return JSON.stringify({ kind: 'complete-partition-analysis', baseSha, headSha,
        partitions: partitions.map(partition => ({ id: partition.id, fileCount: partition.paths.length, ...(partition.units ? { units: partition.units } : {}) })),
        warning: 'Model-derived facts are untrusted analysis, not CI/build/test attestation. Preserve uncertainty. Every complete source partition was supplied, but summaries may miss details.',
        files: facts.flat() });
}

/** Reserve exact paths/framing, then budget worst-case JSON escaping (six bytes/code point). */
export function progressPartitionFactLimit(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], budget = MAX_PROGRESS_AGGREGATE_BYTES, profile?: ProgressEvidenceProfile): number {
    const empty = partitions.map(partition => partition.units
        ? partition.units.map(unit => ({ path: unit.path, unitId: unit.id, implemented: '', remaining: '' }))
        : partition.paths.map(path => ({ path, implemented: '', remaining: '' })));
    const count = empty.reduce((sum, files) => sum + files.length, 0);
    const envelopeBytes = Buffer.byteLength(serializeProgressFacts(baseSha, headSha, partitions, empty, profile), 'utf8');
    const remaining = budget - envelopeBytes;
    const limit = Math.min(600, Math.floor(remaining / (count * 12)));
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > MAX_PROGRESS_AGGREGATE_BYTES) throw invalidProgressCapacityAllocation('aggregate', budget, MAX_PROGRESS_AGGREGATE_BYTES);
    if (count === 0) throw progressEvidenceTooLarge({ phase: 'aggregate', dimension: 'evidence-unit-count', observedCount: 0, supportedLimit: 1, bound: 'minimum' });
    const minimum = profile === 'immutable-tree-v1' ? IMMUTABLE_PROGRESS_PROFILE.minimumFactLength : 1;
    if (limit < minimum) throw progressEvidenceTooLarge({ phase: 'aggregate', dimension: 'minimum-fact-bytes',
        observedCount: envelopeBytes + count * 12 * minimum, supportedLimit: budget });
    return limit;
}

export function aggregateProgressFacts(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], facts: readonly (readonly ProgressFileFacts[])[], budget = MAX_PROGRESS_AGGREGATE_BYTES, profile?: ProgressEvidenceProfile): string {
    const evidence = serializeProgressFacts(baseSha, headSha, partitions, facts, profile);
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > MAX_PROGRESS_AGGREGATE_BYTES) throw invalidProgressCapacityAllocation('aggregate', budget, MAX_PROGRESS_AGGREGATE_BYTES);
    const observedCount = Buffer.byteLength(evidence, 'utf8');
    if (observedCount > budget) throw progressEvidenceTooLarge({ phase: 'aggregate', dimension: 'aggregate-fact-bytes', observedCount, supportedLimit: budget });
    if (facts.length !== partitions.length) throw invalid();
    for (const [index, partition] of partitions.entries()) {
        // Revalidate exact assignments at the aggregation boundary too; no caller can attest a partial inventory.
        parseProgressPartitionFacts({ outputLocale: 'en-US', partitionId: partition.id, files: facts[index] }, partition, 'en-US');
    }
    return evidence;
}
function invalid(): ApplicationError {
    return new ApplicationError('agent.failed', 'A progress partition did not return complete bounded facts for its exact assigned files. Existing progress was retained.');
}
