export declare const PROGRESS_BATCH_REASONS: readonly ["source-coverage", "scope-capacity", "manifest-identity", "batch-identity", "receipt-coverage", "evidence-identity", "evidence-missing", "receipt-conflict", "call-budget", "time-budget", "aggregate-capacity"];
export type ProgressBatchReason = typeof PROGRESS_BATCH_REASONS[number];
export type ProgressBatchDiagnostic = Readonly<{
    readonly reason: ProgressBatchReason;
    readonly verified: number;
    readonly expected: number;
    readonly batch: number;
    readonly requirementId: string;
}>;
export declare function isProgressBatchDiagnostic(value: unknown): value is ProgressBatchDiagnostic;
