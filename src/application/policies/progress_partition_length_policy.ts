import { ProgressPartitionLengthFailure, isProgressPartitionLengthDiagnostic, type ProgressPartitionLengthDiagnostic } from '../../domain/progress_partition_length_failure';
import type { ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { validateAgentOutputLocale } from './agent_output_locale_policy';
import { ApplicationError } from '../errors/application_error';
import { isProgressResponseDiagnosticFacts } from '../../domain/progress_response_diagnostic';

/** Bind returned identity to current immutable assignments, never to response array order. */
export function bindProgressPartitionLength(error: unknown, part: ProgressDiffPartition, limit: number, locale: string): ProgressPartitionLengthDiagnostic | null {
    if (!(error instanceof ProgressPartitionLengthFailure) || !isProgressResponseDiagnosticFacts(error.facts)
        || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) return null;
    const { outputLocale, ...details } = error.details;
    if (!isProgressPartitionLengthDiagnostic(details) || error.facts.phase !== 'partition' || error.facts.reason !== 'schema-string-long'
        || error.facts.field !== details.field || details.maximum !== limit || details.partitionId !== part.id
        || validateAgentOutputLocale({ outputLocale }, locale).kind !== 'valid') return null;
    if (part.units ? !part.units.some(unit => unit.id === details.unitId && unit.path === details.filePath)
        : details.unitId !== 'none' || !part.paths.includes(details.filePath)) return null;
    return Object.freeze(details);
}
export function progressPartitionRepairPrompt(prompt: string): string {
    return `${prompt}\n\nThe previous completed response exceeded the unchanged character limit for a file fact. Produce one concise replacement for this same complete immutable part, with the exact assigned identities and output locale. Both implemented and remaining must satisfy the existing per-field code-point and JSON UTF-8 byte limits shown in the original request. Preserve uncertainty. Do not drop files or source units, invent evidence, repeat the old response, or change the schema. Return only the requested JSON.`;
}
export function progressPartitionLengthRejected(details: ProgressPartitionLengthDiagnostic): ApplicationError {
    return new ApplicationError('agent.failed', 'A progress part still exceeds its unchanged fact bound after one replacement; existing progress was retained.',
        { retryable: false, recovery: { id: 'progress-partition-length-invalid', variables: details } });
}
