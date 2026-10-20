/** Closed vocabulary: no provider text, URLs, headers, policy values or credentials. */
export const APPROVAL_EVIDENCE_PERMISSIONS = Object.freeze({
    'evidence': 'repository-read',
    'pull-request': 'pull-requests-read',
    'base-ref': 'contents-read',
    'merge-commit': 'contents-read',
    'policy': 'actions-variables-read',
    'files': 'pull-requests-read',
    'reviews': 'pull-requests-read',
    'comments': 'issues-read',
    'head-checks': 'checks-read',
    'merge-checks': 'checks-read',
    'head-runs': 'actions-read',
    'merge-runs': 'actions-read',
    'jobs': 'actions-read',
    'rules': 'metadata-read',
    'classic-protection': 'administration-read',
    'authenticated-user': 'authenticated-user-read',
    'coverage-artifacts': 'actions-read',
    'coverage-download': 'actions-read',
    'coverage-parse': 'actions-read',
} as const);
export type ApprovalEvidenceOperation = keyof typeof APPROVAL_EVIDENCE_PERMISSIONS;
export const APPROVAL_EVIDENCE_REASONS = Object.freeze([
    'http-400', 'http-401', 'http-403', 'http-404', 'http-409', 'http-422', 'http-429',
    'http-500', 'http-502', 'http-503', 'http-504', 'transport-unavailable',
    'invalid-response', 'invalid-page', 'page-limit', 'artifact-unavailable', 'artifact-invalid', 'artifact-mismatch',
] as const);
export type ApprovalEvidenceReason = typeof APPROVAL_EVIDENCE_REASONS[number];
export type ApprovalEvidenceDiagnostic = {
    readonly operation: ApprovalEvidenceOperation;
    readonly reason: ApprovalEvidenceReason;
    readonly permission: typeof APPROVAL_EVIDENCE_PERMISSIONS[ApprovalEvidenceOperation];
}
