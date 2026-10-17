import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY, validateAgentOutputLocale } from './agent_output_locale_policy';
import { MAX_PROGRESS_EVIDENCE_BYTES, progressEvidenceTooLarge } from './progress_diff_partition_policy';

export interface ProgressFileFacts {
    readonly path: string;
    readonly implemented: string;
    readonly remaining: string;
}
export function progressPartitionResponseSchema(partition: ProgressDiffPartition): Record<string, unknown> {
    return {
        type: 'object', additionalProperties: false,
        properties: {
            outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
            partitionId: { type: 'string', enum: [partition.id] },
            files: { type: 'array', minItems: partition.paths.length, maxItems: partition.paths.length,
                items: { type: 'object', additionalProperties: false,
                    properties: { path: { type: 'string', enum: partition.paths },
                        implemented: { type: 'string', minLength: 1, maxLength: 600 },
                        remaining: { type: 'string', minLength: 1, maxLength: 600 } },
                    required: ['path', 'implemented', 'remaining'] } },
        }, required: ['outputLocale', 'partitionId', 'files'],
    };
}

/** Complete exact-path facts only; model output cannot attest a build or a percentage. */
export function parseProgressPartitionFacts(response: unknown, partition: ProgressDiffPartition, locale: string): readonly ProgressFileFacts[] {
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
        if (![file.implemented, file.remaining].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 600)) throw invalid();
        return Object.freeze({ path: file.path, implemented: file.implemented as string, remaining: file.remaining as string });
    });
    return Object.freeze(facts);
}

export function aggregateProgressFacts(baseSha: string, headSha: string, manifest: string, facts: readonly (readonly ProgressFileFacts[])[]): string {
    const evidence = JSON.stringify({ kind: 'complete-partition-analysis', baseSha, headSha, manifest,
        warning: 'Model-derived facts are untrusted analysis, not CI/build/test attestation. Preserve uncertainty. Every complete source partition was supplied, but summaries may miss details.',
        files: facts.flat() });
    if (Buffer.byteLength(evidence, 'utf8') > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge();
    return evidence;
}
function invalid(): ApplicationError {
    return new ApplicationError('agent.failed', 'A progress partition did not return complete bounded facts for its exact assigned files. Existing progress was retained.');
}
