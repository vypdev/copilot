import { APPROVAL_EVIDENCE_PERMISSIONS, type ApprovalEvidenceDiagnostic, type ApprovalEvidenceOperation, type ApprovalEvidenceReason } from '../../domain/approval_evidence_diagnostic';
import { ApplicationError, type ApplicationErrorCode } from './application_error';

export function approvalEvidenceError(operation: ApprovalEvidenceOperation, reason: ApprovalEvidenceReason): ApplicationError {
    return approvalDiagnosticError({ operation, reason, permission: APPROVAL_EVIDENCE_PERMISSIONS[operation] });
}

export function approvalDiagnosticError(diagnostic: ApprovalEvidenceDiagnostic): ApplicationError {
    const reason = diagnostic.reason;
    const code: ApplicationErrorCode = reason === 'http-401' ? 'authorization.credential-invalid'
        : reason === 'http-403' ? 'authorization.denied'
            : reason === 'http-404' ? 'provider.not-found'
                : reason === 'http-429' ? 'provider.rate-limited'
                    : reason === 'http-409' ? 'provider.conflict'
                        : reason === 'transport-unavailable' || /^http-50[0234]$/u.test(reason) ? 'provider.unavailable'
                            : 'provider.contract-invalid';
    return new ApplicationError(code, `Approval evidence read failed (${diagnostic.operation}, ${reason}).`, {
        recovery: { id: 'approval-evidence-read-failed', variables: diagnostic },
    });
}
