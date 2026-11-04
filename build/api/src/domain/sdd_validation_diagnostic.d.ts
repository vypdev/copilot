/** Public diagnostics contain only closed checks and bounded ordinal/count facts. */
export declare const SDD_DRAFT_FORMAT_REASONS: readonly ["required-heading", "test-budget", "case-identity", "case-budget", "requirement-mapping", "repository-path"];
export type SddDraftFormatReason = typeof SDD_DRAFT_FORMAT_REASONS[number];
export declare const SDD_VALIDATION_DETAILS: readonly ["validation-contract", "size-limit", "response-shape", "minimum-length", "required-heading", "numeric-budget", "section-count", "table-count", "table-separator", "table-columns", "table-empty-cell", "table-empty", "derived-slot-count", "derived-slot-placement", "identifier-list", "requirement-identity", "case-identity", "case-reserved", "case-reference", "case-shorthand", "budget-area", "budget-integer", "budget-order", "budget-total", "budget-distribution", "requirement-reference", "requirement-coverage", "traceability-links", "traceability-membership", "traceability-requirement", "owner-path", "path-identity", "create-existing-path", "create-path-overlap", "create-path-parent", "path-operation", "path-reference", "path-link", "path-inline-reference", "path-prose-reference", "path-link-reference", "path-reference-unsafe", "path-reference-blocked", "path-reference-missing", "path-reference-directory"];
export type SddValidationDetail = typeof SDD_VALIDATION_DETAILS[number];
export interface SddValidationFact {
    readonly detail: SddValidationDetail;
    readonly section: 0 | 4 | 14 | 15 | 17;
    readonly row?: number;
    readonly expected?: number;
    readonly observed?: number;
}
export interface SddValidationDiagnostic {
    readonly reason: SddDraftFormatReason | 'size' | 'response-shape' | 'response-minimum';
    readonly phase: 'response' | 'assembly' | 'validation';
    readonly facts: readonly SddValidationFact[];
}
export interface SddDraftMinimumDiagnostic {
    readonly minimum: number;
    readonly observed: number | 'unavailable';
    readonly attempts: 1 | 2;
}
/** Counts authorize no publication and never carry the rejected response. */
export declare function isSddDraftMinimumDiagnostic(input: unknown): input is SddDraftMinimumDiagnostic;
/** Fail closed on extra fields, arbitrary text, unbounded facts or invalid coordinates. */
export declare function normalizeSddValidationDiagnostic(input: SddValidationDiagnostic): SddValidationDiagnostic;
