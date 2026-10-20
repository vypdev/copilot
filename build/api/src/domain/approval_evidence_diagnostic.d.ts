/** Closed vocabulary: no provider text, URLs, headers, policy values or credentials. */
export declare const APPROVAL_EVIDENCE_PERMISSIONS: Readonly<{
    readonly evidence: "repository-read";
    readonly 'pull-request': "pull-requests-read";
    readonly 'base-ref': "contents-read";
    readonly 'merge-commit': "contents-read";
    readonly policy: "actions-variables-read";
    readonly files: "pull-requests-read";
    readonly reviews: "pull-requests-read";
    readonly comments: "issues-read";
    readonly 'head-checks': "checks-read";
    readonly 'merge-checks': "checks-read";
    readonly 'head-runs': "actions-read";
    readonly 'merge-runs': "actions-read";
    readonly jobs: "actions-read";
    readonly rules: "metadata-read";
    readonly 'classic-protection': "administration-read";
    readonly 'authenticated-user': "authenticated-user-read";
    readonly 'coverage-artifacts': "actions-read";
    readonly 'coverage-download': "actions-read";
    readonly 'coverage-parse': "actions-read";
}>;
export type ApprovalEvidenceOperation = keyof typeof APPROVAL_EVIDENCE_PERMISSIONS;
export declare const APPROVAL_EVIDENCE_REASONS: readonly ["http-400", "http-401", "http-403", "http-404", "http-409", "http-422", "http-429", "http-500", "http-502", "http-503", "http-504", "transport-unavailable", "invalid-response", "invalid-page", "page-limit", "artifact-unavailable", "artifact-invalid", "artifact-mismatch"];
export type ApprovalEvidenceReason = typeof APPROVAL_EVIDENCE_REASONS[number];
export type ApprovalEvidenceDiagnostic = {
    readonly operation: ApprovalEvidenceOperation;
    readonly reason: ApprovalEvidenceReason;
    readonly permission: typeof APPROVAL_EVIDENCE_PERMISSIONS[ApprovalEvidenceOperation];
};
