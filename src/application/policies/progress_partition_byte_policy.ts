import { ProgressPartitionByteFailure, isProgressPartitionByteDiagnostic, type ProgressPartitionByteDiagnostic } from '../../domain/progress_partition_length_failure';
import type { ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { parseProgressPartitionFacts } from './progress_partition_response_policy';
import { validateAgentOutputLocale } from './agent_output_locale_policy';
import { ApplicationError } from '../errors/application_error';

export function assertProgressPartitionByteLimit(byteLimit?: number): void {
    if (byteLimit !== undefined && (!Number.isSafeInteger(byteLimit) || byteLimit < 1 || byteLimit > 3_600)) {
        throw new ApplicationError('configuration.unsupported', 'Progress fact byte allocation is invalid.');
    }
}

/** Validate the entire ordinary contract before attributing a byte-only rejection. */
export function verifyProgressPartitionBytes(response: unknown, part: ProgressDiffPartition, limit: number, locale: string, byteLimit?: number): void {
    if (byteLimit === undefined) return;
    assertProgressPartitionByteLimit(byteLimit);
    const files = parseProgressPartitionFacts(response, part, locale, limit);
    for (const [index, file] of files.entries()) {
        for (const key of ['implemented', 'remaining'] as const) {
            const observed = Buffer.byteLength(JSON.stringify(file[key]), 'utf8') - 2;
            if (observed > byteLimit) throw new ProgressPartitionByteFailure({ partitionId: part.id, filePath: file.path,
                unitId: file.unitId ?? 'none', field: `$.files[${index}].${key}`, maximum: byteLimit, observed, outputLocale: locale });
        }
    }
}
export function bindProgressPartitionBytes(error: unknown, part: ProgressDiffPartition, byteLimit: number | undefined, locale: string): ProgressPartitionByteDiagnostic | null {
    if (!(error instanceof ProgressPartitionByteFailure) || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) return null;
    const { outputLocale, ...facts } = error.details;
    if (!isProgressPartitionByteDiagnostic(facts) || facts.maximum !== byteLimit || facts.partitionId !== part.id
        || validateAgentOutputLocale({ outputLocale }, locale).kind !== 'valid') return null;
    if (part.units ? !part.units.some(unit => unit.id === facts.unitId && unit.path === facts.filePath)
        : facts.unitId !== 'none' || !part.paths.includes(facts.filePath)) return null;
    return Object.freeze(facts);
}
export function progressPartitionBytesRejected(facts: ProgressPartitionByteDiagnostic): ApplicationError {
    return new ApplicationError('agent.failed', 'A complete progress source fact still exceeds its allocated JSON UTF-8 bytes after one replacement; prior progress was retained.',
        { retryable: false, recovery: { id: 'progress-partition-bytes-invalid', variables: facts } });
}
