import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { progressResponseRejected, progressResponsePayload } from './progress_response_rejection_policy';
import type { ProgressResponseReason } from '../../domain/progress_response_diagnostic';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY } from './agent_output_locale_policy';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';

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

function serializeProgressFacts(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], facts: readonly (readonly ProgressFileFacts[])[]): string {
    return JSON.stringify({ kind: 'complete-partition-analysis', baseSha, headSha,
        partitions: partitions.map(partition => ({ id: partition.id, fileCount: partition.paths.length, ...(partition.units ? { units: partition.units } : {}) })),
        warning: 'Model-derived facts are untrusted analysis, not CI/build/test attestation. Preserve uncertainty. Every complete source partition was supplied, but summaries may miss details.',
        files: facts.flat() });
}

/** Reserve exact paths/framing, then budget worst-case JSON escaping (six bytes/code point). */
export function progressPartitionFactLimit(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], budget = MAX_PROGRESS_AGGREGATE_BYTES): number {
    const empty = partitions.map(partition => partition.units
        ? partition.units.map(unit => ({ path: unit.path, unitId: unit.id, implemented: '', remaining: '' }))
        : partition.paths.map(path => ({ path, implemented: '', remaining: '' })));
    const count = empty.reduce((sum, files) => sum + files.length, 0);
    const remaining = budget - Buffer.byteLength(serializeProgressFacts(baseSha, headSha, partitions, empty), 'utf8');
    const limit = Math.min(600, Math.floor(remaining / (count * 12)));
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > MAX_PROGRESS_AGGREGATE_BYTES || count === 0 || limit < 1) throw progressEvidenceTooLarge();
    return limit;
}

export function aggregateProgressFacts(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], facts: readonly (readonly ProgressFileFacts[])[], budget = MAX_PROGRESS_AGGREGATE_BYTES): string {
    const evidence = serializeProgressFacts(baseSha, headSha, partitions, facts);
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > MAX_PROGRESS_AGGREGATE_BYTES
        || Buffer.byteLength(evidence, 'utf8') > budget) throw progressEvidenceTooLarge();
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
