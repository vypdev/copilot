export declare const PROGRESS_RESPONSE_PHASES: readonly ["scope", "partition", "assessment"];
export type ProgressResponsePhase = typeof PROGRESS_RESPONSE_PHASES[number];
export declare const PROGRESS_RESPONSE_REASONS: Readonly<{
    scope: readonly ["json-invalid", "schema-type", "schema-enum", "schema-string-short", "schema-string-long", "schema-number-finite", "schema-number-min", "schema-number-max", "schema-array-short", "schema-array-long", "schema-required", "schema-additional", "response-not-object", "output-locale-missing", "output-locale-invalid", "output-locale-mismatch", "response-shape-invalid", "scope-incomplete", "scope-entry-invalid", "scope-source-id-invalid", "scope-source-id-duplicate", "scope-classification-invalid", "scope-clause-limit", "scope-no-requirements", "scope-budget"];
    partition: readonly ["json-invalid", "schema-type", "schema-enum", "schema-string-short", "schema-string-long", "schema-number-finite", "schema-number-min", "schema-number-max", "schema-array-short", "schema-array-long", "schema-required", "schema-additional", "response-not-object", "output-locale-missing", "output-locale-invalid", "output-locale-mismatch", "response-shape-invalid", "partition-shape-invalid", "partition-id-invalid", "partition-files-incomplete", "partition-file-invalid", "partition-unit-invalid", "partition-facts-invalid"];
    assessment: readonly ["json-invalid", "schema-type", "schema-enum", "schema-string-short", "schema-string-long", "schema-number-finite", "schema-number-min", "schema-number-max", "schema-array-short", "schema-array-long", "schema-required", "schema-additional", "response-not-object", "output-locale-missing", "output-locale-invalid", "output-locale-mismatch", "response-shape-invalid", "requirements-incomplete", "progress-invalid", "requirement-shape-invalid", "requirement-id-invalid", "requirement-id-duplicate", "scope-uncertain", "requirement-status-invalid", "requirement-evidence-invalid", "requirement-summary-invalid", "requirement-remaining-invalid", "requirement-evidence-mismatch", "progress-completion-mismatch", "assessment-text-limit"];
}>;
export type ProgressResponseReason = typeof PROGRESS_RESPONSE_REASONS[ProgressResponsePhase][number];
export type ProgressResponseDiagnosticFacts = Readonly<{
    phase: ProgressResponsePhase;
    reason: ProgressResponseReason;
    field: string;
    requirementId: string;
    sourceLineId: string;
}>;
export declare const isProgressRequirementId: (value: unknown) => value is string;
export declare const isProgressSourceLineId: (value: unknown) => value is string;
export declare function isProgressResponseField(phase: ProgressResponsePhase, value: unknown): value is string;
/** Unknown model keys and oversized locations never become operator field names. */
export declare function safeProgressResponseField(phase: ProgressResponsePhase, value: unknown): string;
export declare function isProgressResponseDiagnosticFacts(value: unknown): value is ProgressResponseDiagnosticFacts;
/** Carries bounded completed-output facts, never a raw output or exception cause. */
export declare class ProgressResponseContractFailure extends Error {
    readonly facts: ProgressResponseDiagnosticFacts;
    constructor(facts: ProgressResponseDiagnosticFacts);
}
