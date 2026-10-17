import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY, validateAgentOutputLocale } from './agent_output_locale_policy';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';

// Leaves space inside the unchanged 512 KiB runtime prompt ceiling. The caller
// further subtracts the exact issue/prompt envelope before requesting facts.
export const MAX_PROGRESS_AGGREGATE_BYTES = 384_000;

export interface ProgressFileFacts {
    readonly path: string;
    readonly implemented: string;
    readonly remaining: string;
}
export function progressPartitionResponseSchema(partition: ProgressDiffPartition, factLimit = 600): Record<string, unknown> {
    return {
        type: 'object', additionalProperties: false,
        properties: {
            outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
            partitionId: { type: 'string', enum: [partition.id] },
            files: { type: 'array', minItems: partition.paths.length, maxItems: partition.paths.length,
                items: { type: 'object', additionalProperties: false,
                    properties: { path: { type: 'string', enum: partition.paths },
                        implemented: { type: 'string', minLength: 1, maxLength: factLimit },
                        remaining: { type: 'string', minLength: 1, maxLength: factLimit } },
                    required: ['path', 'implemented', 'remaining'] } },
        }, required: ['outputLocale', 'partitionId', 'files'],
    };
}

/** Complete exact-path facts only; model output cannot attest a build or a percentage. */
export function parseProgressPartitionFacts(response: unknown, partition: ProgressDiffPartition, locale: string, factLimit = 600): readonly ProgressFileFacts[] {
    const validation = validateAgentOutputLocale(response, locale);
    if (validation.kind !== 'valid') throw invalid();
    const payload = validation.payload;
    if (Object.keys(payload).sort().join(',') !== 'files,outputLocale,partitionId' || payload.partitionId !== partition.id
        || !Array.isArray(payload.files) || payload.files.length !== partition.paths.length) throw invalid();
    const seen = new Set<string>();
    const facts = payload.files.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalid();
        const file = entry as Record<string, unknown>;
        if (Object.keys(file).sort().join(',') !== 'implemented,path,remaining' || typeof file.path !== 'string'
            || !partition.paths.includes(file.path) || seen.has(file.path)) throw invalid();
        seen.add(file.path);
        if (![file.implemented, file.remaining].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= factLimit)) throw invalid();
        return Object.freeze({ path: file.path, implemented: file.implemented as string, remaining: file.remaining as string });
    });
    return Object.freeze(facts);
}

function serializeProgressFacts(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], facts: readonly (readonly ProgressFileFacts[])[]): string {
    return JSON.stringify({ kind: 'complete-partition-analysis', baseSha, headSha,
        partitions: partitions.map(partition => ({ id: partition.id, fileCount: partition.paths.length })),
        warning: 'Model-derived facts are untrusted analysis, not CI/build/test attestation. Preserve uncertainty. Every complete source partition was supplied, but summaries may miss details.',
        files: facts.flat() });
}

/** Reserve exact paths/framing, then budget worst-case JSON escaping (six bytes/code unit). */
export function progressPartitionFactLimit(baseSha: string, headSha: string, partitions: readonly ProgressDiffPartition[], budget = MAX_PROGRESS_AGGREGATE_BYTES): number {
    const empty = partitions.map(partition => partition.paths.map(path => ({ path, implemented: '', remaining: '' })));
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
    return evidence;
}
function invalid(): ApplicationError {
    return new ApplicationError('agent.failed', 'A progress partition did not return complete bounded facts for its exact assigned files. Existing progress was retained.');
}
