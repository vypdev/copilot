/** Content-free reasons for a completed Bugbot response, never process or provider guesses. */
export declare const BUGBOT_RESPONSE_FAILURE_REASONS: readonly ["json-invalid", "schema-type", "schema-enum", "schema-string-short", "schema-string-long", "schema-number-finite", "schema-number-min", "schema-number-max", "schema-array-short", "schema-array-long", "schema-required", "schema-additional", "verification-invalid"];
export type BugbotResponseFailureReason = typeof BUGBOT_RESPONSE_FAILURE_REASONS[number];
export type BugbotPartitionQueryDiagnostic = Readonly<{
    readonly reason: BugbotResponseFailureReason;
    readonly attempts: 3;
}>;
export declare function isBugbotPartitionQueryDiagnostic(value: unknown): value is BugbotPartitionQueryDiagnostic;
export declare class BugbotResponseFailure extends Error {
    readonly reason: BugbotResponseFailureReason;
    constructor(reason: BugbotResponseFailureReason);
}
