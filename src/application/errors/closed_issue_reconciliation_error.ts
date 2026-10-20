import type { ClosedIssueReconciliationFacts } from '../../domain/closed_issue_reconciliation';
import { ApplicationError } from './application_error';

/** Public diagnostic is fixed native facts and counters, never label/card/provider text. */
export function closedIssueReconciliationError(cause: unknown, facts: ClosedIssueReconciliationFacts): ApplicationError {
    return new ApplicationError(cause instanceof ApplicationError ? cause.code : 'provider.unavailable',
        'Closed issue reconciliation remains unverified.', {
            ...(cause instanceof ApplicationError ? { correlationId: cause.correlationId, retryable: cause.retryable } : {}),
            recovery: { id: 'closed-issue-reconciliation-failed', variables: facts },
        });
}
