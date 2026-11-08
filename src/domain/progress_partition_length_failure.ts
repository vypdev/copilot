import { ProgressResponseContractFailure, isProgressResponseField, type ProgressResponseDiagnosticFacts } from './progress_response_diagnostic';
import { isProgressEvidencePath, renderProgressEvidencePath } from './progress_evidence_path';

export type ProgressPartitionLengthDiagnostic = Readonly<{
    readonly partitionId: string;
    readonly filePath: string;
    readonly unitId: string;
    readonly field: string;
    readonly maximum: number;
    readonly observed: number;
}>;
export type ProgressPartitionLengthContext = ProgressPartitionLengthDiagnostic & Readonly<{
    readonly outputLocale: string;
}>;
/** Completed output supplied these bounded scalars; application must still bind the identity. */
export class ProgressPartitionLengthFailure extends ProgressResponseContractFailure {
    readonly details: ProgressPartitionLengthContext;
    constructor(facts: ProgressResponseDiagnosticFacts, details: ProgressPartitionLengthContext) {
        super(facts); this.details = Object.freeze({ ...details });
    }
}
function text(value: unknown, maximum: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\p{Cc}\p{Cf}]/u.test(value);
}
/** Closed operator facts; string counts are code points, never raw prose or body bytes. */
export function isProgressPartitionLengthDiagnostic(value: unknown): value is ProgressPartitionLengthDiagnostic {
    return isPartitionSizeDiagnostic(value, 600);
}
export type ProgressPartitionByteDiagnostic = ProgressPartitionLengthDiagnostic;
/** Exact JSON UTF-8 bytes excluding quotes, with no widening of the legacy point diagnostic. */
export function isProgressPartitionByteDiagnostic(value: unknown): value is ProgressPartitionByteDiagnostic {
    return isPartitionSizeDiagnostic(value, 3_600) && value.observed <= 3_600;
}
function isPartitionSizeDiagnostic(value: unknown, maximumLimit: number): value is ProgressPartitionLengthDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    return Object.keys(v).sort().join(',') === 'field,filePath,maximum,observed,partitionId,unitId'
        && text(v.partitionId, 256) && isProgressEvidencePath(v.filePath) && text(v.unitId, 256)
        && isProgressResponseField('partition', v.field) && /\.(?:implemented|remaining)$/u.test(v.field as string)
        && typeof v.maximum === 'number' && Number.isSafeInteger(v.maximum) && v.maximum >= 1 && v.maximum <= maximumLimit
        && typeof v.observed === 'number' && Number.isSafeInteger(v.observed) && v.observed > v.maximum;
}

export function progressPartitionLengthPresentation(facts: ProgressPartitionLengthDiagnostic): Readonly<Record<string, string | number>> {
    return Object.freeze({ ...facts, partitionId: renderProgressEvidencePath(facts.partitionId), filePath: renderProgressEvidencePath(facts.filePath),
        unitId: renderProgressEvidencePath(facts.unitId), field: renderProgressEvidencePath(facts.field) });
}


/** Only closed host measurements survive this rejection, never the returned prose. */
export class ProgressPartitionByteFailure extends Error {
    readonly details: ProgressPartitionLengthContext;
    constructor(details: ProgressPartitionLengthContext) {
        super('A complete progress source fact exceeds its allocated JSON UTF-8 bytes.');
        const { outputLocale: _locale, ...facts } = details;
        if (!isProgressPartitionByteDiagnostic(facts)) throw new TypeError('Progress partition byte diagnostic is invalid.');
        this.details = Object.freeze({ ...details });
    }
}
