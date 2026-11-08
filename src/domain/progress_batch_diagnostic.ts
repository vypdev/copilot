export const PROGRESS_BATCH_REASONS = [
    'source-coverage', 'scope-capacity', 'manifest-identity', 'batch-identity', 'receipt-coverage',
    'evidence-identity', 'evidence-missing', 'evidence-duplicate', 'receipt-conflict', 'call-budget', 'time-budget', 'aggregate-capacity',
] as const;
export type ProgressBatchReason = typeof PROGRESS_BATCH_REASONS[number];
export type ProgressBatchDiagnostic = Readonly<{
    readonly reason: ProgressBatchReason;
    readonly verified: number;
    readonly expected: number;
    readonly batch: number;
    readonly requirementId: string;
}>;
export function isProgressBatchDiagnostic(value: unknown): value is ProgressBatchDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const facts = value as Record<string, unknown>;
    return Object.keys(facts).sort().join(',') === 'batch,expected,reason,requirementId,verified'
        && PROGRESS_BATCH_REASONS.includes(facts.reason as ProgressBatchReason)
        && [facts.verified, facts.expected, facts.batch].every(count => Number.isSafeInteger(count) && (count as number) >= 0 && (count as number) <= 1024)
        && (facts.verified as number) <= (facts.expected as number)
        && typeof facts.requirementId === 'string' && /^(?:none|R[1-9]\d{0,5})$/u.test(facts.requirementId);
}
