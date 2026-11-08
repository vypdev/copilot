/** Content-free reasons for a completed Bugbot response, never process or provider guesses. */
export const BUGBOT_RESPONSE_FAILURE_REASONS = Object.freeze(['json-invalid', 'schema-type', 'schema-enum', 'schema-string-short',
    'schema-string-long', 'schema-number-finite', 'schema-number-min', 'schema-number-max', 'schema-array-short',
    'schema-array-long', 'schema-required', 'schema-additional', 'verification-invalid'] as const);
export type BugbotResponseFailureReason = typeof BUGBOT_RESPONSE_FAILURE_REASONS[number];
export type BugbotPartitionQueryDiagnostic = Readonly<{
    readonly reason: BugbotResponseFailureReason;
    readonly attempts: 3;
}>;
export function isBugbotPartitionQueryDiagnostic(value: unknown): value is BugbotPartitionQueryDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const facts = value as Record<string, unknown>;
    return Object.keys(facts).sort().join(',') === 'attempts,reason' && facts.attempts === 3
        && BUGBOT_RESPONSE_FAILURE_REASONS.some(reason => reason === facts.reason);
}
export class BugbotResponseFailure extends Error {
    constructor(readonly reason: BugbotResponseFailureReason) {
        super('A completed Bugbot response did not satisfy its structured contract.');
        if (!BUGBOT_RESPONSE_FAILURE_REASONS.some(known => known === reason)) throw new TypeError('Bugbot response reason is invalid.');
    }
}
