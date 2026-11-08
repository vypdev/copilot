import { ProgressResponseContractFailure, type ProgressResponseDiagnosticFacts } from './progress_response_diagnostic';
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
export declare class ProgressPartitionLengthFailure extends ProgressResponseContractFailure {
    readonly details: ProgressPartitionLengthContext;
    constructor(facts: ProgressResponseDiagnosticFacts, details: ProgressPartitionLengthContext);
}
/** Closed operator facts; string counts are code points, never raw prose or body bytes. */
export declare function isProgressPartitionLengthDiagnostic(value: unknown): value is ProgressPartitionLengthDiagnostic;
export type ProgressPartitionByteDiagnostic = ProgressPartitionLengthDiagnostic;
/** Exact JSON UTF-8 bytes excluding quotes, with no widening of the legacy point diagnostic. */
export declare function isProgressPartitionByteDiagnostic(value: unknown): value is ProgressPartitionByteDiagnostic;
export declare function progressPartitionLengthPresentation(facts: ProgressPartitionLengthDiagnostic): Readonly<Record<string, string | number>>;
/** Only closed host measurements survive this rejection, never the returned prose. */
export declare class ProgressPartitionByteFailure extends Error {
    readonly details: ProgressPartitionLengthContext;
    constructor(details: ProgressPartitionLengthContext);
}
