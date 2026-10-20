import { ApplicationError } from '../../../application/errors/application_error';
import { approvalEvidenceError } from '../../../application/errors/approval_evidence_error';
import { APPROVAL_EVIDENCE_REASONS, type ApprovalEvidenceOperation, type ApprovalEvidenceReason } from '../../../domain/approval_evidence_diagnostic';

/** Terminates provider exceptions; even unknown statuses never interpolate provider text. */
export async function readApprovalEvidence<T>(operation: ApprovalEvidenceOperation, read: () => Promise<T>): Promise<T> {
    try { return await read(); } catch (cause) {
        if (cause instanceof ApplicationError && cause.recovery?.id === 'approval-evidence-read-failed') throw cause;
        const error = cause && typeof cause === 'object' ? cause as Record<string, unknown> : undefined;
        const response = error?.response as { headers?: Record<string, unknown> } | undefined;
        const status = error?.status;
        const rateLimited = status === 403 && (response?.headers?.['x-ratelimit-remaining'] === '0'
            || typeof response?.headers?.['retry-after'] === 'string' && /^\d{1,8}$/u.test(response.headers['retry-after']));
        const http = typeof status === 'number' ? `http-${status}` : undefined;
        const reason: ApprovalEvidenceReason = rateLimited ? 'http-429'
            : APPROVAL_EVIDENCE_REASONS.some(value => value === http) ? http as ApprovalEvidenceReason
                : cause instanceof ApplicationError && cause.code === 'provider.contract-invalid' ? 'invalid-response'
                    : status === undefined ? 'transport-unavailable' : 'invalid-response';
        throw approvalEvidenceError(operation, reason);
    }
}
